import { App, Modal, Notice } from "obsidian";
import type SuperProductivitySyncPlugin from "./main";
import type { ParsedInput } from "./parse";
import type { SPProject, SPTag, SPTask } from "./types";
import { QuickAddInput } from "./quickadd";
import { getErrorMessage } from "./util";

/**
 * Standalone "add a task" modal for the quick-add command, usable without
 * the sidebar view open. Fetches its own tags/projects on open so the same
 * @/#/+ autocomplete works here too.
 */
export class QuickAddModal extends Modal {
	private tags: SPTag[] = [];
	private projects: SPProject[] = [];
	private quickAdd!: QuickAddInput;
	private statusEl!: HTMLElement;

	constructor(app: App, private plugin: SuperProductivitySyncPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sp-wizard");
		contentEl.createEl("h3", { text: "Add SuperProductivity task" });

		const row = contentEl.createDiv();
		this.quickAdd = new QuickAddInput(
			row,
			() => this.tags,
			() => this.projects,
			(parsed) => {
				void this.submit(parsed);
			}
		);
		this.quickAdd.setDisabled(true);

		contentEl.createDiv({ cls: "sp-hint", text: "@today/@tomorrow/@monday.../@nextweek · #tag · +project · 30m/2h" });
		this.statusEl = contentEl.createEl("p", { cls: "sp-wizard-status" });
		this.statusEl.setText("Loading projects and tags …");

		void this.loadOptions();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadOptions(): Promise<void> {
		try {
			const [projects, tags] = await Promise.all([this.plugin.api.getProjects(), this.plugin.api.getTags()]);
			this.projects = projects;
			this.tags = tags;
			this.statusEl.setText("");
			this.quickAdd.setDisabled(false);
			this.quickAdd.focus();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		}
	}

	private async submit(parsed: ParsedInput): Promise<void> {
		if (!parsed.title) {
			this.statusEl.setText("Title is missing (only shortcuts entered?)");
			return;
		}
		this.quickAdd.setDisabled(true);
		try {
			const body: Partial<SPTask> & { title: string; projectId: string } = {
				title: parsed.title,
				projectId: parsed.projectId || "INBOX_PROJECT",
			};
			if (parsed.dueDay) body.dueDay = parsed.dueDay;
			if (parsed.tagIds.length) body.tagIds = parsed.tagIds;
			if (parsed.timeEstimate) body.timeEstimate = parsed.timeEstimate;
			await this.plugin.api.createTask(body);
			new Notice(`Task added: ${parsed.title}`);
			this.close();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			this.quickAdd.setDisabled(false);
		}
	}
}
