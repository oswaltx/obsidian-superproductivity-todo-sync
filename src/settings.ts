import { App, PluginSettingTab, Setting } from "obsidian";
import type SuperProductivitySyncPlugin from "./main";
import { SPSetupWizardModal } from "./wizard";

export class SPSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SuperProductivitySyncPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Setup wizard")
			.setDesc("Walks you through enabling the local REST API in SuperProductivity and entering the base URL/token.")
			.addButton((b) =>
				b.setButtonText("Open setup wizard").onClick(() => {
					new SPSetupWizardModal(this.app, this.plugin).open();
				})
			);

		new Setting(containerEl).setName("Connection").setHeading();

		new Setting(containerEl)
			.setName("Base URL")
			.setDesc("Address of SuperProductivity's local REST API, e.g. http://127.0.0.1:3876. The port is not fixed.")
			.addText((t) =>
				t
					.setPlaceholder("http://127.0.0.1:3876")
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (v) => {
						this.plugin.settings.baseUrl = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API token")
			.setDesc("Shown in SuperProductivity under Settings → Misc after enabling the local REST API.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder("Paste token")
					.setValue(this.plugin.settings.token)
					.onChange(async (v) => {
						this.plugin.settings.token = v.trim();
						await this.plugin.saveSettings();
					});
			});

		let testStatusEl: HTMLElement;
		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Checks the base URL and token against SuperProductivity.")
			.addButton((b) =>
				b.setButtonText("Test now").onClick(async () => {
					b.setDisabled(true);
					testStatusEl.setText("Testing connection …");
					testStatusEl.removeClass("sp-status-ok", "sp-status-error");
					const result = await this.plugin.api.testConnection();
					testStatusEl.setText((result.ok ? "✅ " : "❌ ") + result.message);
					testStatusEl.addClass(result.ok ? "sp-status-ok" : "sp-status-error");
					b.setDisabled(false);
				})
			);
		testStatusEl = containerEl.createEl("p", { cls: "sp-wizard-status" });

		new Setting(containerEl).setName("View").setHeading();

		new Setting(containerEl)
			.setName("Auto-refresh interval (seconds)")
			.setDesc("0 disables auto-refresh; you can still reload the view manually.")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.refreshIntervalSeconds))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isFinite(n) || n < 0) return;
						this.plugin.settings.refreshIntervalSeconds = n;
						await this.plugin.saveSettings();
						this.plugin.refreshViewInterval();
					})
			);

		new Setting(containerEl).setName("Priority sort order").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Tasks are sorted within the same day by the position of their first matching tag below — top sorts first. Tasks with none of these tags sort last. Tags must already exist in SuperProductivity; add as many as you like.",
		});

		const priorityTags = this.plugin.settings.priorityTags;
		priorityTags.forEach((tag, i) => {
			new Setting(containerEl)
				.setName(`#${i + 1}`)
				.addText((t) =>
					t
						.setPlaceholder("Tag title")
						.setValue(tag)
						.onChange(async (v) => {
							priorityTags[i] = v.trim();
							await this.plugin.saveSettings();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("arrow-up")
						.setTooltip("Move up")
						.setDisabled(i === 0)
						.onClick(async () => {
							if (i === 0) return;
							[priorityTags[i - 1], priorityTags[i]] = [priorityTags[i], priorityTags[i - 1]];
							await this.plugin.saveSettings();
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("arrow-down")
						.setTooltip("Move down")
						.setDisabled(i === priorityTags.length - 1)
						.onClick(async () => {
							if (i === priorityTags.length - 1) return;
							[priorityTags[i + 1], priorityTags[i]] = [priorityTags[i], priorityTags[i + 1]];
							await this.plugin.saveSettings();
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(async () => {
							priorityTags.splice(i, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});

		new Setting(containerEl).addButton((b) =>
			b.setButtonText("+ Add tag").onClick(async () => {
				priorityTags.push("");
				await this.plugin.saveSettings();
				this.display();
			})
		);

		new Setting(containerEl)
			.setName("Waiting tag")
			.setDesc("Title of the tag (case-insensitive) that shows tasks in the separate \"Waiting\" section.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.waitingTag)
					.onChange(async (v) => {
						this.plugin.settings.waitingTag = v.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
