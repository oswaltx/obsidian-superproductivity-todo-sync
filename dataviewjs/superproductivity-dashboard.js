/*
 * SuperProductivity dashboard as a standalone dataviewjs snippet.
 *
 * This is the original prototype this plugin was built from — see the
 * "Alternative: dataviewjs snippet" section in the repo README for how to
 * use it. Requires the Dataview plugin (with JavaScript queries enabled).
 *
 * Before pasting this into a note:
 *   - Set `tokenPath` below to the actual path of your own
 *     `local-rest-api-token` file (its location depends on your OS and how
 *     SuperProductivity is installed).
 *   - Change `port: 3876` if your SuperProductivity installation uses a
 *     different port.
 *   - Rename the "Prio-High" / "Prio-Low" / "waiting" tag titles below if
 *     your own SuperProductivity tags are named differently.
 *
 * To use it, wrap this file's contents in a dataviewjs code block in any
 * note:
 *
 *   ```dataviewjs
 *   ... (paste this file's contents here) ...
 *   ```
 */
try {
const fs = require("fs");
const http = require("http");
const tokenPath = "/path/to/your/local-rest-api-token";
const token = fs.readFileSync(tokenPath, "utf-8").trim();

// Plain Node http.request instead of fetch() -- fetch() always sends an Origin
// header (Obsidian's renderer origin), and SP's REST server explicitly 403s ANY
// request carrying an Origin header ("Requests from web origins are not
// allowed"). Node's http module doesn't add one, so this sidesteps the block
// untouched on SP's side.
const call = (method, path, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { Authorization: "Bearer " + token };
    if (data) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = http.request({ hostname: "127.0.0.1", port: 3876, path: path, method: method, headers: headers }, (res) => {
        let out = "";
        res.on("data", (c) => { out += c; });
        res.on("end", () => {
            try {
                const json = JSON.parse(out);
                if (!json.ok) reject(new Error((json.error && json.error.message) || "SP request failed"));
                else resolve(json.data);
            } catch (e) { reject(e); }
        });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
});

const [projects, tasks, tags] = await Promise.all([call("GET", "/projects"), call("GET", "/tasks"), call("GET", "/tags")]);
const projectTitle = {};
for (const p of projects) projectTitle[p.id] = p.title;

const root = dv.el("div", "");

const addRow = root.createEl("div");
addRow.style.cssText = "display:flex;gap:0.4em;margin-bottom:0.2em;position:relative;";
const input = addRow.createEl("input", { type: "text", attr: { placeholder: "New task  @today #tag +project 30m" } });
input.style.cssText = "flex:1;";
const addBtn = addRow.createEl("button", { text: "+" });

const hint = root.createEl("div", { text: "@today/@tomorrow/@monday.../@nextweek · #tag · +project · 30m/2h" });
hint.style.cssText = "opacity:0.5;font-size:0.75em;margin-bottom:0.5em;";

const statusEl = root.createEl("div");
statusEl.style.cssText = "opacity:0.7;font-size:0.85em;margin-bottom:0.4em;min-height:1em;";

// --- @/#/+ short-syntax autocomplete, same tokens SuperProductivity's own
// add-task bar uses (https://deepwiki.com/johannesjo/super-productivity/3.4-adding-tasks)
// -- but resolved entirely client-side here (we compute dueDay/tagIds/projectId
// ourselves before POSTing), not via SP's chrono parser, so the keyword list
// below is ours, not a chrono grammar.
const DATE_KEYWORDS = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "nextweek"];
const WEEKDAY_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

const resolveDateKeyword = (word) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (word === "today") return d;
    if (word === "tomorrow") { d.setDate(d.getDate() + 1); return d; }
    if (word === "nextweek") { d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return d; }
    if (word in WEEKDAY_NUM) { d.setDate(d.getDate() + ((WEEKDAY_NUM[word] - d.getDay() + 7) % 7)); return d; }
    return null;
};
const toISO = (d) => d.toISOString().slice(0, 10);

const dropdown = root.createEl("div");
dropdown.style.cssText = "position:absolute;top:100%;left:0;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:100;max-height:180px;overflow-y:auto;display:none;min-width:10em;";
addRow.appendChild(dropdown);

let suggestions = [];
let selIdx = 0;
let tokenStart = -1;

const currentToken = () => {
    const pos = input.selectionStart;
    const m = input.value.slice(0, pos).match(/([@#+])([^\s@#+]*)$/);
    if (!m) return null;
    return { trigger: m[1], partial: m[2].toLowerCase(), start: pos - m[0].length };
};

const hideDropdown = () => { dropdown.style.display = "none"; suggestions = []; };

const renderDropdown = (trigger) => {
    dropdown.empty();
    dropdown.style.display = "block";
    suggestions.forEach((s, i) => {
        const item = dropdown.createEl("div", { text: trigger + s });
        item.style.cssText = "padding:0.2em 0.6em;cursor:pointer;" + (i === selIdx ? "background:var(--background-modifier-hover);" : "");
        item.addEventListener("mousedown", (e) => { e.preventDefault(); applySuggestion(trigger, s); });
    });
};

const applySuggestion = (trigger, s) => {
    const before = input.value.slice(0, tokenStart);
    const after = input.value.slice(input.selectionStart);
    const insertion = trigger + s + " ";
    input.value = before + insertion + after;
    const pos = (before + insertion).length;
    input.focus();
    input.setSelectionRange(pos, pos);
    hideDropdown();
};

const updateSuggestions = () => {
    const tok = currentToken();
    if (!tok) { hideDropdown(); return; }
    let items = [];
    if (tok.trigger === "@") items = DATE_KEYWORDS.filter((k) => k.startsWith(tok.partial));
    else if (tok.trigger === "#") items = tags.map((t) => t.title).filter((t) => t.toLowerCase().startsWith(tok.partial));
    else if (tok.trigger === "+") items = projects.map((p) => p.title).filter((t) => t.toLowerCase().startsWith(tok.partial));
    if (items.length === 0) { hideDropdown(); return; }
    suggestions = items;
    selIdx = 0;
    tokenStart = tok.start;
    renderDropdown(tok.trigger);
};

input.addEventListener("input", updateSuggestions);
input.addEventListener("blur", () => setTimeout(hideDropdown, 150));

// parses @date / #tag / +project / Nm|Nh out of the raw text, resolving tags
// and projects against what's ACTUALLY in SP (no create-on-the-fly -- the
// REST API has no endpoint to create tags); anything unrecognized (typo, tag
// that doesn't exist) is left as literal title text rather than silently
// dropped.
const parseInput = (text) => {
    let title = text;
    let dueDay = null;
    let tagIds = [];
    let projectId = null;
    let timeEstimate = null;

    title = title.replace(/@([A-Za-z]+)/g, (full, word) => {
        const resolved = resolveDateKeyword(word.toLowerCase());
        if (resolved) { dueDay = toISO(resolved); return ""; }
        return full;
    });
    title = title.replace(/#(\S+)/g, (full, word) => {
        const match = tags.find((t) => t.title.toLowerCase() === word.toLowerCase());
        if (match) { tagIds.push(match.id); return ""; }
        return full;
    });
    title = title.replace(/\+(\S+)/g, (full, word) => {
        const match = projects.find((p) => p.title.toLowerCase() === word.toLowerCase());
        if (match) { projectId = match.id; return ""; }
        return full;
    });
    const timeMatch = title.match(/(?:^|\s)(\d+)(m|h)(?=\s|$)/);
    if (timeMatch) {
        const n = parseInt(timeMatch[1], 10);
        timeEstimate = timeMatch[2] === "h" ? n * 3600000 : n * 60000;
        title = title.replace(timeMatch[0], "");
    }

    return { title: title.replace(/\s+/g, " ").trim(), dueDay: dueDay, tagIds: tagIds, projectId: projectId, timeEstimate: timeEstimate };
};

const groupsContainer = root.createEl("div");

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "how many calendar days from today" -- local-date math, not ms/86400000 on
// raw Date objects, so DST transitions can't shift the count by a day.
const dayDiff = (dueDay) => {
    const [y, m, d] = dueDay.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const t = new Date();
    const today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((due - today0) / 86400000);
};

// Short, scannable label instead of the raw ISO date -- "3 days ago" /
// "today" / "tomorrow" / weekday name reads faster than "2026-09-06".
const dateLabel = (t) => {
    if (!t.dueDay) return null;
    const diff = dayDiff(t.dueDay);
    if (diff < 0) return (-diff) + (diff === -1 ? " day ago" : " days ago");
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    const [y, m, d] = t.dueDay.split("-").map(Number);
    return weekdayShort[new Date(y, m - 1, d).getDay()];
};

const badge = (parent, text) => {
    const el = parent.createEl("span", { text: text });
    el.style.cssText = "padding:0.05em 0.5em;border-radius:4px;background:var(--background-modifier-border);white-space:nowrap;";
    return el;
};

const renderGroups = () => {
    groupsContainer.empty();
    const open = tasks.filter((t) => !t.isDone);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Prio-High/Prio-Low are plain SP tags (created in the app itself, e.g.
    // via "#Prio-High" in the title -- the REST API can't create tags on its
    // own). At the same due date, the high tag sorts first, low sorts last,
    // untagged tasks sort in between.
    const prioHighId = (tags.find((t) => t.title === "Prio-High") || {}).id;
    const prioLowId = (tags.find((t) => t.title === "Prio-Low") || {}).id;
    const prioRank = (t) => {
        const ids = t.tagIds || [];
        if (prioHighId && ids.includes(prioHighId)) return 0;
        if (prioLowId && ids.includes(prioLowId)) return 2;
        return 1;
    };

    const byDueAsc = (a, b) => a.dueDay.localeCompare(b.dueDay);
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const byPrioThenTitle = (a, b) => prioRank(a) - prioRank(b) || byTitle(a, b);
    const byDueThenPrio = (a, b) => byDueAsc(a, b) || prioRank(a) - prioRank(b);

    const groups = [
        // ascending due date first, Prio-High/Low as tiebreaker within the same day
        ["⚠️ Overdue", open.filter((t) => t.dueDay && t.dueDay < todayStr).sort(byDueThenPrio), true],
        // no per-date badge here (every task is due "today"), but priority still counts
        ["📅 Due today", open.filter((t) => t.dueDay === todayStr).sort(byPrioThenTitle), false],
        ["🗓️ This week", open.filter((t) => t.dueDay && t.dueDay > todayStr && t.dueDay <= weekEndStr).sort(byDueThenPrio), true],
        ["📆 No date", open.filter((t) => !t.dueDay).sort(byPrioThenTitle), true],
    ];

    for (const [label, list, showDate] of groups) {
        const titleEl = groupsContainer.createEl("div");
        titleEl.style.cssText = "font-weight:600;margin-top:0.6em;display:flex;align-items:center;gap:0.5em;";
        titleEl.createEl("span", { text: label + " (" + list.length + ")" });
        if (label.startsWith("⚠️") && list.length > 0) {
            const rescheduleBtn = titleEl.createEl("button", { text: "→ all to today" });
            rescheduleBtn.style.cssText = "font-size:0.75em;font-weight:normal;";
            rescheduleBtn.addEventListener("click", async () => {
                rescheduleBtn.disabled = true;
                try {
                    await Promise.all(list.map((t) =>
                        call("PATCH", "/tasks/" + t.id, { dueDay: todayStr }).then(() => { t.dueDay = todayStr; })
                    ));
                    renderGroups();
                } catch (e) {
                    statusEl.setText("Error: " + e.message);
                    rescheduleBtn.disabled = false;
                }
            });
        }
        if (list.length === 0) {
            const emptyEl = groupsContainer.createEl("div", { text: "none" });
            emptyEl.style.cssText = "opacity:0.6;margin-left:1em;";
            continue;
        }
        for (const t of list) {
            const row = groupsContainer.createEl("div");
            row.style.cssText = "margin-left:0.5em;display:flex;align-items:center;gap:0.5em;padding:0.15em 0;";
            const checkbox = row.createEl("input", { type: "checkbox" });
            const prio = prioRank(t);
            if (prio === 0) row.createEl("span", { text: "🔴" }).title = "Prio-High";
            if (prio === 2) row.createEl("span", { text: "🔽" }).title = "Prio-Low";
            const titleSpan = row.createEl("span", { text: t.title });
            titleSpan.style.cssText = "flex:1;";
            const meta = row.createEl("span");
            meta.style.cssText = "display:flex;gap:0.4em;font-size:0.8em;opacity:0.75;";
            const dl = showDate ? dateLabel(t) : null;
            if (dl) badge(meta, dl);
            if (projectTitle[t.projectId]) badge(meta, projectTitle[t.projectId]);

            // Detect a note link: obsidian://open?...&file=<path> somewhere in
            // the notes text (e.g. as a markdown link) -- if present, a small
            // icon to open the note directly in Obsidian itself (instead of
            // via the external URI, which is a detour through an app switch).
            const noteMatch = (t.notes || "").match(/obsidian:\/\/open\?[^)\s]*?file=([^)&\s]+)/);
            if (noteMatch) {
                const notePath = decodeURIComponent(noteMatch[1]);
                const noteBtn = row.createEl("a", { text: "📝", cls: "internal-link" });
                noteBtn.style.cssText = "cursor:pointer;text-decoration:none;font-size:0.9em;";
                noteBtn.title = "Open note: " + notePath;
                noteBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    const file = app.vault.getAbstractFileByPath(notePath + ".md")
                        || app.vault.getAbstractFileByPath(notePath);
                    if (file) app.workspace.getLeaf(false).openFile(file);
                    else new Notice("Note not found: " + notePath);
                });
            }

            checkbox.addEventListener("change", async () => {
                checkbox.disabled = true;
                try {
                    await call("PATCH", "/tasks/" + t.id, { isDone: true });
                    t.isDone = true;
                    renderGroups();
                } catch (e) {
                    checkbox.disabled = false;
                    checkbox.checked = false;
                    statusEl.setText("Error: " + e.message);
                }
            });
        }
    }
};

const doAdd = async () => {
    const raw = input.value.trim();
    if (!raw) return;
    const parsed = parseInput(raw);
    if (!parsed.title) { statusEl.setText("Title is missing (only shortcuts entered?)"); return; }
    addBtn.disabled = true;
    try {
        const body = { title: parsed.title, projectId: parsed.projectId || "INBOX_PROJECT" };
        if (parsed.dueDay) body.dueDay = parsed.dueDay;
        if (parsed.tagIds.length) body.tagIds = parsed.tagIds;
        if (parsed.timeEstimate) body.timeEstimate = parsed.timeEstimate;
        const newTask = await call("POST", "/tasks", body);
        tasks.push(newTask);
        input.value = "";
        statusEl.setText("");
        renderGroups();
    } catch (e) {
        statusEl.setText("Error: " + e.message);
    } finally {
        addBtn.disabled = false;
    }
};
addBtn.addEventListener("click", doAdd);
input.addEventListener("keydown", (e) => {
    if (dropdown.style.display === "block") {
        if (e.key === "ArrowDown") { e.preventDefault(); selIdx = (selIdx + 1) % suggestions.length; renderDropdown(currentToken().trigger); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); selIdx = (selIdx - 1 + suggestions.length) % suggestions.length; renderDropdown(currentToken().trigger); return; }
        if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); applySuggestion(currentToken().trigger, suggestions[selIdx]); return; }
        if (e.key === "Escape") { hideDropdown(); return; }
    }
    if (e.key === "Enter") doAdd();
});

renderGroups();

} catch (e) {
dv.paragraph("SuperProductivity is unreachable (is the app open? maybe the port changed) — " + e.message + "");
}
