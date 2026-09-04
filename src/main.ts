import { Plugin, WorkspaceLeaf } from "obsidian";
import { SuperProductivityClient } from "./api";
import { SPSettingTab } from "./settings";
import { DEFAULT_SETTINGS, SPPluginSettings } from "./types";
import { SPView, VIEW_TYPE_SP } from "./view";
import { SPSetupWizardModal } from "./wizard";

export default class SuperProductivitySyncPlugin extends Plugin {
	settings!: SPPluginSettings;
	api!: SuperProductivityClient;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.api = new SuperProductivityClient(() => ({
			baseUrl: this.settings.baseUrl,
			token: this.settings.token,
		}));

		this.registerView(VIEW_TYPE_SP, (leaf) => new SPView(leaf, this));

		this.addRibbonIcon("check-circle-2", "SuperProductivity Todo Sync", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-superproductivity-view",
			name: "Open SuperProductivity task view",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "open-superproductivity-setup-wizard",
			name: "Open setup wizard",
			callback: () => new SPSetupWizardModal(this.app, this).open(),
		});

		this.addSettingTab(new SPSettingTab(this.app, this));

		if (!this.settings.setupCompleted) {
			this.app.workspace.onLayoutReady(() => {
				new SPSetupWizardModal(this.app, this).open();
			});
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as (Partial<SPPluginSettings> & { prioHighTag?: string; prioLowTag?: string }) | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Migrate the old fixed high/low priority tag fields (pre-0.2) into the ordered list.
		if (data && !Array.isArray(data.priorityTags) && (data.prioHighTag || data.prioLowTag)) {
			this.settings.priorityTags = [data.prioHighTag, data.prioLowTag].filter((t): t is string => !!t);
		}
		delete (this.settings as unknown as Record<string, unknown>).prioHighTag;
		delete (this.settings as unknown as Record<string, unknown>).prioLowTag;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Called by the settings tab after the refresh interval changes. */
	refreshViewInterval(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SP)) {
			if (leaf.view instanceof SPView) leaf.view.restartInterval();
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_SP);
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_SP, active: true });
		}
		if (leaf) void workspace.revealLeaf(leaf);
	}

	onunload(): void {
		// registerView/registerInterval are cleaned up automatically by Obsidian.
	}
}
