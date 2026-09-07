import { App, Modal } from "obsidian";
import type { ChangelogEntry } from "./changelog";

const REPO_URL = "https://github.com/oswaltx/obsidian-superproductivity-todo-sync";
const COFFEE_URL = "https://buymeacoffee.com/oswalt";

export class WhatsNewModal extends Modal {
	constructor(app: App, private entries: ChangelogEntry[]) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sp-wizard");

		contentEl.createEl("h2", { text: `SuperProductivity Todo Sync — updated to v${this.entries[0].version}` });

		for (const entry of this.entries) {
			contentEl.createEl("h4", { text: `v${entry.version}` });
			const ul = contentEl.createEl("ul");
			for (const highlight of entry.highlights) ul.createEl("li", { text: highlight });
		}

		const links = contentEl.createDiv({ cls: "sp-whats-new-links" });
		links.createEl("a", { text: "View source on GitHub", href: REPO_URL });
		links.createEl("a", { text: "☕ Buy me a coffee", href: COFFEE_URL });

		const btnRow = contentEl.createDiv({ cls: "sp-wizard-buttons" });
		const closeBtn = btnRow.createEl("button", { text: "Got it", cls: "mod-cta" });
		closeBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
