import { App, Modal, Setting } from "obsidian";
import type SuperProductivitySyncPlugin from "./main";

export class SPSetupWizardModal extends Modal {
	constructor(app: App, private plugin: SuperProductivitySyncPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sp-wizard");

		contentEl.createEl("h2", { text: "SuperProductivity Todo Sync – Setup" });

		const steps = contentEl.createEl("ol");
		steps.createEl("li", {
			text: 'Open SuperProductivity and enable "Enable local REST API" under Settings → Misc.',
		});
		steps.createEl("li", {
			text: "SuperProductivity will then show you the base URL and an API token — enter both below.",
		});
		steps.createEl("li", { text: 'Click "Test connection" to verify the details.' });

		new Setting(contentEl)
			.setName("Base URL")
			.setDesc("Address of SuperProductivity's local REST API. The port is not fixed and must match your installation.")
			.addText((t) =>
				t
					.setPlaceholder("http://127.0.0.1:3876")
					.setValue(this.plugin.settings.baseUrl)
					.onChange((v) => {
						this.plugin.settings.baseUrl = v.trim();
					})
			);

		new Setting(contentEl)
			.setName("API token")
			.setDesc("Shown in SuperProductivity after enabling the local REST API.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder("Paste token")
					.setValue(this.plugin.settings.token)
					.onChange((v) => {
						this.plugin.settings.token = v.trim();
					});
			});

		const statusEl = contentEl.createEl("p", { cls: "sp-wizard-status" });

		const btnRow = contentEl.createDiv({ cls: "sp-wizard-buttons" });

		const testBtn = btnRow.createEl("button", { text: "Test connection" });
		testBtn.addEventListener("click", () => {
			void this.testConnection(testBtn, statusEl);
		});

		const doneBtn = btnRow.createEl("button", { text: "Done", cls: "mod-cta" });
		doneBtn.addEventListener("click", () => {
			void this.finishSetup();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async testConnection(testBtn: HTMLButtonElement, statusEl: HTMLElement): Promise<void> {
		testBtn.disabled = true;
		statusEl.removeClass("sp-status-ok", "sp-status-error");
		statusEl.setText("Testing connection …");
		await this.plugin.saveSettings();
		const result = await this.plugin.api.testConnection();
		statusEl.setText((result.ok ? "✅ " : "❌ ") + result.message);
		statusEl.addClass(result.ok ? "sp-status-ok" : "sp-status-error");
		testBtn.disabled = false;
	}

	private async finishSetup(): Promise<void> {
		this.plugin.settings.setupCompleted = true;
		await this.plugin.saveSettings();
		this.close();
		await this.plugin.activateView();
	}
}
