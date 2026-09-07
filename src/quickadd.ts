import type { SPProject, SPTag, SPTask } from "./types";
import { DATE_KEYWORDS, parseInput, type ParsedInput } from "./parse";

interface TokenMatch {
	trigger: "@" | "#" | "+" | "^";
	partial: string;
	start: number;
}

/**
 * The `@`/`#`/`+`/`^`-shortcut input with autocomplete, shared between the
 * sidebar view and the quick-add command's modal so the dropdown/keyboard
 * logic lives in exactly one place.
 */
export class QuickAddInput {
	private input: HTMLInputElement;
	private addBtn: HTMLButtonElement;
	private dropdown: HTMLElement;
	private suggestions: string[] = [];
	private selIdx = 0;
	private tokenStart = -1;

	constructor(
		container: HTMLElement,
		private getTags: () => SPTag[],
		private getProjects: () => SPProject[],
		private getParentTasks: () => SPTask[],
		private onSubmit: (parsed: ParsedInput, raw: string) => void
	) {
		container.addClass("sp-add-row");
		this.input = container.createEl("input", {
			type: "text",
			cls: "sp-add-input",
			attr: { placeholder: "New task  @today #tag +project ^parent 30m" },
		});
		this.addBtn = container.createEl("button", { text: "+", cls: "sp-add-btn" });
		this.dropdown = container.createDiv({ cls: "sp-dropdown" });

		this.addBtn.addEventListener("click", () => this.submit());
		this.input.addEventListener("input", () => this.updateSuggestions());
		this.input.addEventListener("blur", () => window.setTimeout(() => this.hideDropdown(), 150));
		this.input.addEventListener("keydown", (e) => this.onKeydown(e));
	}

	focus(): void {
		this.input.focus();
	}

	setDisabled(disabled: boolean): void {
		this.input.disabled = disabled;
		this.addBtn.disabled = disabled;
	}

	clear(): void {
		this.input.value = "";
	}

	private submit(): void {
		const raw = this.input.value.trim();
		if (!raw) return;
		this.onSubmit(parseInput(raw, this.getTags(), this.getProjects(), this.getParentTasks()), raw);
	}

	private currentToken(): TokenMatch | null {
		const pos = this.input.selectionStart ?? this.input.value.length;
		const m = this.input.value.slice(0, pos).match(/([@#+^])([^\s@#+^]*)$/);
		if (!m) return null;
		return { trigger: m[1] as "@" | "#" | "+" | "^", partial: m[2].toLowerCase(), start: pos - m[0].length };
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
		else if (tok.trigger === "#")
			items = this.getTags()
				.map((t) => t.title)
				.filter((t) => t.toLowerCase().startsWith(tok.partial));
		else if (tok.trigger === "+")
			items = this.getProjects()
				.map((p) => p.title)
				.filter((t) => t.toLowerCase().startsWith(tok.partial));
		else if (tok.trigger === "^")
			items = this.getParentTasks()
				.map((t) => t.title)
				.filter((t) => t.toLowerCase().startsWith(tok.partial));
		if (items.length === 0) {
			this.hideDropdown();
			return;
		}
		this.suggestions = items;
		this.selIdx = 0;
		this.tokenStart = tok.start;
		this.renderDropdown(tok.trigger);
	}

	private onKeydown(e: KeyboardEvent): void {
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
		if (e.key === "Enter") this.submit();
	}
}
