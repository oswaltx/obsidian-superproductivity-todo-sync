import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type SuperProductivitySyncPlugin from "./main";
import type { SPProject, SPTag, SPTask } from "./types";
import { DATE_KEYWORDS, dateLabel, parseInput, prioRank } from "./parse";
import { getErrorMessage } from "./util";

export const VIEW_TYPE_SP = "superproductivity-todo-sync-view";

interface TokenMatch {
	trigger: "@" | "#" | "+";
	partial: string;
	start: number;
}

export class SPView extends ItemView {
	private plugin: SuperProductivitySyncPlugin;

	private projects: SPProject[] = [];
	private tags: SPTag[] = [];
	private tasks: SPTask[] = [];
	private loaded = false;

	private intervalId: number | null = null;

	private groupsContainer!: HTMLElement;
	private statusEl!: HTMLElement;
	private input!: HTMLInputElement;
	private addBtn!: HTMLButtonElement;
	private dropdown!: HTMLElement;
	private suggestions: string[] = [];
	private selIdx = 0;
	private tokenStart = -1;
	private priorityTagEntries: { id: string; title: string }[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: SuperProductivitySyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SP;
	}

	getDisplayText(): string {
		return "SuperProductivity";
	}

	getIcon(): string {
		return "check-circle-2";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("sp-root");

		if (!this.plugin.settings.setupCompleted) {
			this.renderSetupPrompt(root);
			return;
		}

		this.buildChrome(root);
		this.startInterval();
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private renderSetupPrompt(root: HTMLElement): void {
		root.createEl("p", {
			text: "SuperProductivity is not set up yet.",
		});
		const btn = root.createEl("button", { text: "Open setup wizard", cls: "mod-cta" });
		btn.addEventListener("click", () => {
			void (async () => {
				const { SPSetupWizardModal } = await import("./wizard");
				new SPSetupWizardModal(this.app, this.plugin).open();
			})();
		});
	}

	private startInterval(): void {
		const seconds = this.plugin.settings.refreshIntervalSeconds;
		if (seconds > 0) {
			this.intervalId = window.setInterval(() => this.refresh(), seconds * 1000);
			this.registerInterval(this.intervalId);
		}
	}

	/** Called by the settings tab after the refresh interval changes. */
	restartInterval(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.startInterval();
	}

	private buildChrome(root: HTMLElement): void {
		const addRow = root.createDiv({ cls: "sp-add-row" });
		this.input = addRow.createEl("input", {
			type: "text",
			cls: "sp-add-input",
			attr: { placeholder: "New task  @today #tag +project 30m" },
		});
		this.addBtn = addRow.createEl("button", { text: "+", cls: "sp-add-btn" });
		this.dropdown = addRow.createDiv({ cls: "sp-dropdown" });

		root.createDiv({ cls: "sp-hint", text: "@today/@tomorrow/@monday.../@nextweek · #tag · +project · 30m/2h" });
		this.statusEl = root.createDiv({ cls: "sp-status" });

		this.groupsContainer = root.createDiv({ cls: "sp-groups" });

		this.addBtn.addEventListener("click", () => {
			void this.doAdd();
		});
		this.input.addEventListener("input", () => this.updateSuggestions());
		this.input.addEventListener("blur", () => window.setTimeout(() => this.hideDropdown(), 150));
		this.input.addEventListener("keydown", (e) => this.onInputKeydown(e));
	}

	async refresh(): Promise<void> {
		try {
			const [projects, tasks, tags] = await Promise.all([
				this.plugin.api.getProjects(),
				this.plugin.api.getTasks(),
				this.plugin.api.getTags(),
			]);
			this.projects = projects;
			this.tasks = tasks;
			this.tags = tags;
			this.loaded = true;
			this.statusEl.setText("");
			this.statusEl.removeClass("sp-status-error");
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("SuperProductivity is unreachable: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			if (!this.loaded) this.groupsContainer.empty();
		}
	}

	// ---- add-task autocomplete -------------------------------------------------

	private currentToken(): TokenMatch | null {
		const pos = this.input.selectionStart ?? this.input.value.length;
		const m = this.input.value.slice(0, pos).match(/([@#+])([^\s@#+]*)$/);
		if (!m) return null;
		return { trigger: m[1] as "@" | "#" | "+", partial: m[2].toLowerCase(), start: pos - m[0].length };
	}

	private hideDropdown(): void {
		this.dropdown.removeClass("is-open");
		this.dropdown.empty();
		this.suggestions = [];
	}

	private renderDropdown(trigger: string): void {
		this.dropdown.empty();
		this.dropdown.addClass("is-open");
		this.suggestions.forEach((s, i) => {
			const item = this.dropdown.createDiv({
				cls: "sp-dropdown-item" + (i === this.selIdx ? " is-selected" : ""),
				text: trigger + s,
			});
			item.addEventListener("mousedown", (e) => {
				e.preventDefault();
				this.applySuggestion(trigger, s);
			});
		});
	}

	private applySuggestion(trigger: string, s: string): void {
		const before = this.input.value.slice(0, this.tokenStart);
		const after = this.input.value.slice(this.input.selectionStart ?? this.input.value.length);
		const insertion = trigger + s + " ";
		this.input.value = before + insertion + after;
		const pos = (before + insertion).length;
		this.input.focus();
		this.input.setSelectionRange(pos, pos);
		this.hideDropdown();
	}

	private updateSuggestions(): void {
		const tok = this.currentToken();
		if (!tok) {
			this.hideDropdown();
			return;
		}
		let items: string[] = [];
		if (tok.trigger === "@") items = DATE_KEYWORDS.filter((k) => k.startsWith(tok.partial));
		else if (tok.trigger === "#") items = this.tags.map((t) => t.title).filter((t) => t.toLowerCase().startsWith(tok.partial));
		else if (tok.trigger === "+") items = this.projects.map((p) => p.title).filter((t) => t.toLowerCase().startsWith(tok.partial));
		if (items.length === 0) {
			this.hideDropdown();
			return;
		}
		this.suggestions = items;
		this.selIdx = 0;
		this.tokenStart = tok.start;
		this.renderDropdown(tok.trigger);
	}

	private onInputKeydown(e: KeyboardEvent): void {
		if (this.dropdown.hasClass("is-open")) {
			const tok = this.currentToken();
			if (e.key === "ArrowDown") {
				e.preventDefault();
				this.selIdx = (this.selIdx + 1) % this.suggestions.length;
				if (tok) this.renderDropdown(tok.trigger);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				this.selIdx = (this.selIdx - 1 + this.suggestions.length) % this.suggestions.length;
				if (tok) this.renderDropdown(tok.trigger);
				return;
			}
			if (e.key === "Tab" || e.key === "Enter") {
				e.preventDefault();
				if (tok) this.applySuggestion(tok.trigger, this.suggestions[this.selIdx]);
				return;
			}
			if (e.key === "Escape") {
				this.hideDropdown();
				return;
			}
		}
		if (e.key === "Enter") void this.doAdd();
	}

	private async doAdd(): Promise<void> {
		const raw = this.input.value.trim();
		if (!raw) return;
		const parsed = parseInput(raw, this.tags, this.projects);
		if (!parsed.title) {
			this.statusEl.setText("Title is missing (only shortcuts entered?)");
			return;
		}
		this.addBtn.disabled = true;
		try {
			const body: Partial<SPTask> & { title: string; projectId: string } = {
				title: parsed.title,
				projectId: parsed.projectId || "INBOX_PROJECT",
			};
			if (parsed.dueDay) body.dueDay = parsed.dueDay;
			if (parsed.tagIds.length) body.tagIds = parsed.tagIds;
			if (parsed.timeEstimate) body.timeEstimate = parsed.timeEstimate;
			const newTask = await this.plugin.api.createTask(body);
			this.tasks.push(newTask);
			this.input.value = "";
			this.statusEl.setText("");
			this.statusEl.removeClass("sp-status-error");
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		} finally {
			this.addBtn.disabled = false;
		}
	}

	// ---- rendering ---------------------------------------------------------

	private badge(parent: HTMLElement, text: string): void {
		parent.createSpan({ cls: "sp-badge", text });
	}

	private renderTaskRow(container: HTMLElement, t: SPTask, showDate: boolean): void {
		const projectTitle = new Map(this.projects.map((p) => [p.id, p.title]));
		const row = container.createDiv({ cls: "sp-task-row" });
		const checkbox = row.createEl("input", { type: "checkbox" });
		const rank = prioRank(
			t,
			this.priorityTagEntries.map((e) => e.id)
		);
		if (rank < this.priorityTagEntries.length) {
			row.createSpan({
				cls: "sp-prio-badge",
				text: String(rank + 1),
				attr: { title: this.priorityTagEntries[rank].title },
			});
		}
		row.createSpan({ cls: "sp-task-title", text: t.title });

		const meta = row.createDiv({ cls: "sp-task-meta" });
		const dl = showDate ? dateLabel(t) : null;
		if (dl) this.badge(meta, dl);
		const pTitle = t.projectId ? projectTitle.get(t.projectId) : undefined;
		if (pTitle) this.badge(meta, pTitle);

		const noteMatch = (t.notes || "").match(/obsidian:\/\/open\?[^)\s]*?file=([^)&\s]+)/);
		if (noteMatch) {
			const notePath = decodeURIComponent(noteMatch[1]);
			const noteBtn = row.createEl("a", { text: "📝", cls: "sp-note-link" });
			noteBtn.setAttribute("title", "Open note: " + notePath);
			noteBtn.addEventListener("click", (e) => {
				e.preventDefault();
				const file =
					this.app.vault.getAbstractFileByPath(notePath + ".md") ||
					this.app.vault.getAbstractFileByPath(notePath);
				if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
				else new Notice("Note not found: " + notePath);
			});
		}

		checkbox.addEventListener("change", () => {
			void this.completeTask(t, checkbox);
		});
	}

	private async completeTask(t: SPTask, checkbox: HTMLInputElement): Promise<void> {
		checkbox.disabled = true;
		try {
			await this.plugin.api.patchTask(t.id, { isDone: true });
			t.isDone = true;
			this.renderGroups();
		} catch (e) {
			checkbox.disabled = false;
			checkbox.checked = false;
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		}
	}

	private tagIdFor(title: string): string | undefined {
		if (!title) return undefined;
		return this.tags.find((t) => t.title === title)?.id;
	}

	private renderGroups(): void {
		this.groupsContainer.empty();
		const open = this.tasks.filter((t) => !t.isDone);
		const today = new Date();
		const todayStr = today.toISOString().slice(0, 10);
		const weekEnd = new Date(today);
		weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
		const weekEndStr = weekEnd.toISOString().slice(0, 10);

		this.priorityTagEntries = this.plugin.settings.priorityTags
			.map((title) => ({ title, id: this.tagIdFor(title) }))
			.filter((e): e is { title: string; id: string } => !!e.id);
		const priorityTagIds = this.priorityTagEntries.map((e) => e.id);
		const rank = (t: SPTask) => prioRank(t, priorityTagIds);

		const byDueAsc = (a: SPTask, b: SPTask) => (a.dueDay ?? "").localeCompare(b.dueDay ?? "");
		const byTitle = (a: SPTask, b: SPTask) => a.title.localeCompare(b.title);
		const byPrioThenTitle = (a: SPTask, b: SPTask) => rank(a) - rank(b) || byTitle(a, b);
		const byDueThenPrio = (a: SPTask, b: SPTask) => byDueAsc(a, b) || rank(a) - rank(b);

		const groups: [string, SPTask[], boolean][] = [
			["⚠️ Overdue", open.filter((t) => t.dueDay && t.dueDay < todayStr).sort(byDueThenPrio), true],
			["📅 Due today", open.filter((t) => t.dueDay === todayStr).sort(byPrioThenTitle), false],
			[
				"🗓️ This week",
				open.filter((t) => t.dueDay && t.dueDay > todayStr && t.dueDay <= weekEndStr).sort(byDueThenPrio),
				true,
			],
			["📆 No date", open.filter((t) => !t.dueDay).sort(byPrioThenTitle), true],
		];

		for (const [label, list, showDate] of groups) {
			this.renderGroup(label, list, showDate, label.startsWith("⚠️"), todayStr);
		}

		const waitingTitle = this.plugin.settings.waitingTag.toLowerCase();
		if (waitingTitle) {
			const waitingIds = new Set(this.tags.filter((t) => t.title.toLowerCase() === waitingTitle).map((t) => t.id));
			const waiting = open.filter((t) => (t.tagIds || []).some((id) => waitingIds.has(id))).sort(byTitle);
			this.renderGroup("⏳ Waiting", waiting, true, false, todayStr);
		}
	}

	private renderGroup(label: string, list: SPTask[], showDate: boolean, allowReschedule: boolean, todayStr: string): void {
		const titleEl = this.groupsContainer.createDiv({ cls: "sp-group-title" });
		titleEl.createSpan({ text: `${label} (${list.length})` });

		if (allowReschedule && list.length > 0) {
			const rescheduleBtn = titleEl.createEl("button", { text: "→ all to today", cls: "sp-reschedule-btn" });
			rescheduleBtn.addEventListener("click", () => {
				void this.rescheduleToToday(list, todayStr, rescheduleBtn);
			});
		}

		if (list.length === 0) {
			this.groupsContainer.createDiv({ cls: "sp-group-empty", text: "none" });
			return;
		}
		for (const t of list) this.renderTaskRow(this.groupsContainer, t, showDate);
	}

	private async rescheduleToToday(list: SPTask[], todayStr: string, rescheduleBtn: HTMLButtonElement): Promise<void> {
		rescheduleBtn.disabled = true;
		try {
			await Promise.all(
				list.map((t) =>
					this.plugin.api.patchTask(t.id, { dueDay: todayStr }).then(() => {
						t.dueDay = todayStr;
					})
				)
			);
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			rescheduleBtn.disabled = false;
		}
	}
}
