import type { SPProject, SPTag, SPTask } from "./types";

export const DATE_KEYWORDS = [
	"today",
	"tomorrow",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
	"nextweek",
];

const WEEKDAY_NUM: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function resolveDateKeyword(word: string): Date | null {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	if (word === "today") return d;
	if (word === "tomorrow") {
		d.setDate(d.getDate() + 1);
		return d;
	}
	if (word === "nextweek") {
		d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
		return d;
	}
	if (word in WEEKDAY_NUM) {
		d.setDate(d.getDate() + ((WEEKDAY_NUM[word] - d.getDay() + 7) % 7));
		return d;
	}
	return null;
}

export function toISO(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export interface ParsedInput {
	title: string;
	dueDay: string | null;
	tagIds: string[];
	projectId: string | null;
	timeEstimate: number | null;
}

/**
 * Parses @date / #tag / +project / Nm|Nh out of raw input text, resolving
 * tags and projects against what actually exists in SuperProductivity (the
 * REST API has no endpoint to create tags on the fly). Anything unrecognized
 * (typo, tag that doesn't exist) is left as literal title text rather than
 * silently dropped.
 */
export function parseInput(text: string, tags: SPTag[], projects: SPProject[]): ParsedInput {
	let title = text;
	let dueDay: string | null = null;
	const tagIds: string[] = [];
	let projectId: string | null = null;
	let timeEstimate: number | null = null;

	title = title.replace(/@([A-Za-z]+)/g, (full: string, word: string) => {
		const resolved = resolveDateKeyword(word.toLowerCase());
		if (resolved) {
			dueDay = toISO(resolved);
			return "";
		}
		return full;
	});
	title = title.replace(/#(\S+)/g, (full: string, word: string) => {
		const match = tags.find((t) => t.title.toLowerCase() === word.toLowerCase());
		if (match) {
			tagIds.push(match.id);
			return "";
		}
		return full;
	});
	title = title.replace(/\+(\S+)/g, (full: string, word: string) => {
		const match = projects.find((p) => p.title.toLowerCase() === word.toLowerCase());
		if (match) {
			projectId = match.id;
			return "";
		}
		return full;
	});
	const timeMatch = title.match(/(?:^|\s)(\d+)(m|h)(?=\s|$)/);
	if (timeMatch) {
		const n = parseInt(timeMatch[1], 10);
		timeEstimate = timeMatch[2] === "h" ? n * 3600000 : n * 60000;
		title = title.replace(timeMatch[0], "");
	}

	return {
		title: title.replace(/\s+/g, " ").trim(),
		dueDay,
		tagIds,
		projectId,
		timeEstimate,
	};
}

/** How many calendar days from today, using local-date math so DST can't shift the count by a day. */
export function dayDiff(dueDay: string): number {
	const [y, m, d] = dueDay.split("-").map(Number);
	const due = new Date(y, m - 1, d);
	const t = new Date();
	const today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.round((due.getTime() - today0.getTime()) / 86400000);
}

export function dateLabel(task: SPTask): string | null {
	if (!task.dueDay) return null;
	const diff = dayDiff(task.dueDay);
	if (diff < 0) return -diff + (diff === -1 ? " day ago" : " days ago");
	if (diff === 0) return "today";
	if (diff === 1) return "tomorrow";
	const [y, m, d] = task.dueDay.split("-").map(Number);
	return WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()];
}

/**
 * Rank of a task within a user-defined, ordered priority tag list: the index
 * of the first listed tag the task carries (0 = highest priority), or
 * `priorityTagIds.length` if the task has none of them, sorting it last.
 */
export function prioRank(task: SPTask, priorityTagIds: string[]): number {
	const ids = task.tagIds || [];
	for (let i = 0; i < priorityTagIds.length; i++) {
		if (ids.includes(priorityTagIds[i])) return i;
	}
	return priorityTagIds.length;
}
