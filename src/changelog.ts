export interface ChangelogEntry {
	version: string;
	highlights: string[];
}

/** Newest first. Add a new entry here alongside every version bump. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: "0.3.3",
		highlights: [
			"The view now refreshes instantly when Obsidian regains focus, not just on the polling interval — checking something off or adding a task directly in SuperProductivity shows up here as soon as you switch back.",
			"Drag any task onto a top-level task to make it a subtask.",
		],
	},
	{
		version: "0.3.2",
		highlights: [
			'Deleting a task no longer pops a blocking confirm dialog — click the trash icon once to arm it, again within a few seconds to actually delete.',
		],
	},
	{
		version: "0.3.1",
		highlights: [
			"Subtasks: shown nested under their parent task, and creatable with a `^parent task` quick-add shortcut.",
			"Click a task's due-date badge to change it inline, and a filter box to narrow the list by title.",
			"Delete a task, or click its title to rename it in place.",
			'A "Quick add task" command adds a task without opening the sidebar (assign your own hotkey).',
		],
	},
	{
		version: "0.3.0",
		highlights: ['Project tabs ("All" plus one per project) to filter the whole view down to a single project.'],
	},
	{
		version: "0.2.1",
		highlights: [
			"Switched the network layer to Obsidian's own requestUrl() API, and a round of code-quality fixes from the Community review.",
		],
	},
	{
		version: "0.2.0",
		highlights: ["Initial public release."],
	},
];

/**
 * Entries newer than `previousVersion`, newest first. Falls back to just the
 * latest entry if there's no previous version on record (first install, or
 * upgrading from a version older than this feature) or it isn't recognized -
 * never dumps the entire history on someone who's merely never seen this
 * modal before.
 */
export function getEntriesSince(previousVersion: string | undefined): ChangelogEntry[] {
	if (!previousVersion) return CHANGELOG.slice(0, 1);
	const idx = CHANGELOG.findIndex((e) => e.version === previousVersion);
	if (idx <= 0) return CHANGELOG.slice(0, 1);
	return CHANGELOG.slice(0, idx);
}
