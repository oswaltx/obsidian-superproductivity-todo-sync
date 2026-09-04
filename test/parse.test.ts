import { parseInput, dayDiff, dateLabel, prioRank, resolveDateKeyword, toISO } from "../src/parse";
import type { SPProject, SPTag, SPTask } from "../src/types";

let failures = 0;
function assertEq(actual: unknown, expected: unknown, label: string) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		failures++;
		console.error(`FAIL ${label}: got ${a}, expected ${e}`);
	} else {
		console.log(`ok   ${label}`);
	}
}

const tags: SPTag[] = [
	{ id: "t1", title: "Prio-High" },
	{ id: "t2", title: "Prio-Low" },
	{ id: "t3", title: "waiting" },
];
const projects: SPProject[] = [
	{ id: "p1", title: "Household" },
	{ id: "p2", title: "Work" },
];

// --- parseInput ---
{
	const r = parseInput("Buy milk @today #Prio-High +Household 30m", tags, projects);
	assertEq(r.title, "Buy milk", "parseInput title");
	assertEq(r.dueDay, toISO((() => { const d = new Date(); d.setHours(0,0,0,0); return d; })()), "parseInput @today resolves to today");
	assertEq(r.tagIds, ["t1"], "parseInput #tag resolves existing tag");
	assertEq(r.projectId, "p1", "parseInput +project resolves existing project");
	assertEq(r.timeEstimate, 30 * 60000, "parseInput 30m -> ms");
}
{
	const r = parseInput("Call dentist 2h", tags, projects);
	assertEq(r.timeEstimate, 2 * 3600000, "parseInput 2h -> ms");
	assertEq(r.title, "Call dentist", "parseInput strips time token");
}
{
	// unknown tag/project left as literal text, not dropped
	const r = parseInput("Something #doesnotexist +alsomissing", tags, projects);
	assertEq(r.title, "Something #doesnotexist +alsomissing", "parseInput leaves unmatched # / + as literal text");
	assertEq(r.tagIds, [], "parseInput no tagIds for unmatched tag");
	assertEq(r.projectId, null, "parseInput no projectId for unmatched project");
}
{
	const r = parseInput("Only shortcuts @today #Prio-High", tags, projects);
	assertEq(r.title, "Only shortcuts", "parseInput title after stripping known shortcuts");
}

// --- resolveDateKeyword / weekday math ---
{
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	assertEq(toISO(resolveDateKeyword("today")!), toISO(today), "resolveDateKeyword today");
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	assertEq(toISO(resolveDateKeyword("tomorrow")!), toISO(tomorrow), "resolveDateKeyword tomorrow");
	assertEq(resolveDateKeyword("bogus"), null, "resolveDateKeyword unknown word -> null");
}

// --- dayDiff / dateLabel ---
{
	const today = new Date();
	const todayStr = toISO(today);
	assertEq(dayDiff(todayStr), 0, "dayDiff today is 0");

	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 3);
	const t: SPTask = { id: "x", title: "x", isDone: false, dueDay: toISO(yesterday) };
	assertEq(dateLabel(t), "3 days ago", "dateLabel 3 days overdue");

	const t2: SPTask = { id: "x", title: "x", isDone: false, dueDay: todayStr };
	assertEq(dateLabel(t2), "today", "dateLabel today");
}

// --- prioRank (user-defined ordered tag list) ---
{
	const first: SPTask = { id: "1", title: "a", isDone: false, tagIds: ["t1"] };
	const second: SPTask = { id: "2", title: "b", isDone: false, tagIds: ["t2"] };
	const third: SPTask = { id: "3", title: "c", isDone: false, tagIds: ["t3"] };
	const none: SPTask = { id: "4", title: "d", isDone: false, tagIds: [] };
	const order = ["t1", "t2", "t3"];
	assertEq(prioRank(first, order), 0, "prioRank first listed tag -> 0");
	assertEq(prioRank(second, order), 1, "prioRank second listed tag -> 1");
	assertEq(prioRank(third, order), 2, "prioRank third listed tag -> 2");
	assertEq(prioRank(none, order), 3, "prioRank no matching tag -> sorts after all listed (list length)");
	assertEq(prioRank(first, []), 0, "prioRank with empty list -> 0 (no-op)");

	// a single tag can appear anywhere in an arbitrarily long list, not just "high"/"low"
	const longOrder = ["a", "b", "t1", "c"];
	assertEq(prioRank(first, longOrder), 2, "prioRank matches at any position in a longer list");
}

console.log(failures === 0 ? "\nAll parse.ts tests passed." : `\n${failures} parse.ts test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
