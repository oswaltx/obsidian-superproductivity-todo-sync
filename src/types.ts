export interface SPProject {
	id: string;
	title: string;
}

export interface SPTag {
	id: string;
	title: string;
}

export interface SPTask {
	id: string;
	title: string;
	isDone: boolean;
	dueDay?: string;
	projectId?: string;
	tagIds?: string[];
	notes?: string;
	timeEstimate?: number;
}

export interface SPPluginSettings {
	/** Full base URL of SuperProductivity's local REST API, e.g. http://127.0.0.1:3876 */
	baseUrl: string;
	token: string;
	refreshIntervalSeconds: number;
	/** Ordered tag titles to sort by within the same day: index 0 sorts first, unlisted/untagged tasks sort last. */
	priorityTags: string[];
	/** Tag title (case-insensitive) that marks a task as "waiting". */
	waitingTag: string;
	setupCompleted: boolean;
}

export const DEFAULT_SETTINGS: SPPluginSettings = {
	baseUrl: "http://127.0.0.1:3876",
	token: "",
	refreshIntervalSeconds: 60,
	priorityTags: ["Prio-High", "Prio-Low"],
	waitingTag: "waiting",
	setupCompleted: false,
};
