import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type SuperProductivitySyncPlugin from "./main";
import type { SPProject, SPTag, SPTask } from "./types";
import { dateLabel, prioRank, type ParsedInput } from "./parse";
import { QuickAddInput } from "./quickadd";
import { getErrorMessage } from "./util";

export const VIEW_TYPE_SP = "superproductivity-todo-sync-view";

export class SPView extends ItemView {
	private plugin: SuperProductivitySyncPlugin;

	private projects: SPProject[] = [];
	private tags: SPTag[] = [];
	private tasks: SPTask[] = [];
	private loaded = false;

	private intervalId: number | null = null;

	private groupsContainer!: HTMLElement;
	private statusEl!: HTMLElement;
	private quickAdd!: QuickAddInput;
	private priorityTagEntries: { id: string; title: string }[] = [];
	private selectedProjectId: string | null = null;
	private tabsContainer!: HTMLElement;
	private searchQuery = "";

	constructor(leaf: WorkspaceLeaf, plugin: SuperProductivitySyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SP;
	}

	getDisplayText(): string {
		return "SuperProductivity";
	}

	getIcon(): string {
		return "check-circle-2";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("sp-root");

		if (!this.plugin.settings.setupCompleted) {
			this.renderSetupPrompt(root);
			return;
		}

		this.buildChrome(root);
		this.startInterval();
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private renderSetupPrompt(root: HTMLElement): void {
		root.createEl("p", {
			text: "SuperProductivity is not set up yet.",
		});
		const btn = root.createEl("button", { text: "Open setup wizard", cls: "mod-cta" });
		btn.addEventListener("click", () => {
			void (async () => {
				const { SPSetupWizardModal } = await import("./wizard");
				new SPSetupWizardModal(this.app, this.plugin).open();
			})();
		});
	}

	private startInterval(): void {
		const seconds = this.plugin.settings.refreshIntervalSeconds;
		if (seconds > 0) {
			this.intervalId = window.setInterval(() => this.refresh(), seconds * 1000);
			this.registerInterval(this.intervalId);
		}
	}

	/** Called by the settings tab after the refresh interval changes. */
	restartInterval(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.startInterval();
	}

	private buildChrome(root: HTMLElement): void {
		const addRow = root.createDiv();
		this.quickAdd = new QuickAddInput(
			addRow,
			() => this.tags,
			() => this.projects,
			() => this.tasks.filter((t) => !t.parentId),
			(parsed) => {
				void this.doAdd(parsed);
			}
		);

		root.createDiv({
			cls: "sp-hint",
			text: "@today/@tomorrow/@monday.../@nextweek · #tag · +project · ^parent task · 30m/2h",
		});

		const searchInput = root.createEl("input", {
			type: "search",
			cls: "sp-search-input",
			attr: { placeholder: "Filter tasks…" },
		});
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value.trim().toLowerCase();
			this.renderGroups();
		});

		this.tabsContainer = root.createDiv({ cls: "sp-project-tabs" });
		this.statusEl = root.createDiv({ cls: "sp-status" });

		this.groupsContainer = root.createDiv({ cls: "sp-groups" });
	}

	async refresh(): Promise<void> {
		try {
			const [projects, tasks, tags] = await Promise.all([
				this.plugin.api.getProjects(),
				this.plugin.api.getTasks(),
				this.plugin.api.getTags(),
			]);
			this.projects = projects;
			this.tasks = tasks;
			this.tags = tags;
			this.loaded = true;
			this.statusEl.setText("");
			this.statusEl.removeClass("sp-status-error");
			if (this.selectedProjectId && !projects.some((p) => p.id === this.selectedProjectId)) {
				this.selectedProjectId = null;
			}
			this.renderProjectTabs();
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("SuperProductivity is unreachable: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			if (!this.loaded) this.groupsContainer.empty();
		}
	}

	private async doAdd(parsed: ParsedInput): Promise<void> {
		if (!parsed.title) {
			this.statusEl.setText("Title is missing (only shortcuts entered?)");
			return;
		}
		this.quickAdd.setDisabled(true);
		try {
			// A subtask create can carry neither projectId nor tagIds - it always
			// inherits its parent's project and can't have its own tags.
			const body: Partial<SPTask> & { title: string } = { title: parsed.title };
			if (parsed.parentId) {
				body.parentId = parsed.parentId;
			} else {
				body.projectId = parsed.projectId || "INBOX_PROJECT";
				if (parsed.tagIds.length) body.tagIds = parsed.tagIds;
			}
			if (parsed.dueDay) body.dueDay = parsed.dueDay;
			if (parsed.timeEstimate) body.timeEstimate = parsed.timeEstimate;
			const newTask = await this.plugin.api.createTask(body);
			this.tasks.push(newTask);
			this.quickAdd.clear();
			this.statusEl.setText("");
			this.statusEl.removeClass("sp-status-error");
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		} finally {
			this.quickAdd.setDisabled(false);
		}
	}

	// ---- rendering ---------------------------------------------------------

	private renderProjectTabs(): void {
		this.tabsContainer.empty();
		if (this.projects.length === 0) return;

		const allTab = this.tabsContainer.createEl("button", {
			cls: "sp-project-tab" + (this.selectedProjectId === null ? " is-active" : ""),
			text: "All",
		});
		allTab.addEventListener("click", () => {
			this.selectedProjectId = null;
			this.renderProjectTabs();
			this.renderGroups();
		});

		for (const p of this.projects) {
			const tab = this.tabsContainer.createEl("button", {
				cls: "sp-project-tab" + (this.selectedProjectId === p.id ? " is-active" : ""),
				text: p.title,
			});
			tab.addEventListener("click", () => {
				this.selectedProjectId = p.id;
				this.renderProjectTabs();
				this.renderGroups();
			});
		}
	}

	private badge(parent: HTMLElement, text: string): void {
		parent.createSpan({ cls: "sp-badge", text });
	}

	private renderTaskRow(container: HTMLElement, t: SPTask, showDate: boolean, isSubtask: boolean): void {
		const projectTitle = new Map(this.projects.map((p) => [p.id, p.title]));
		const row = container.createDiv({ cls: isSubtask ? "sp-task-row sp-subtask-row" : "sp-task-row" });
		const checkbox = row.createEl("input", { type: "checkbox" });
		if (!isSubtask) {
			const rank = prioRank(
				t,
				this.priorityTagEntries.map((e) => e.id)
			);
			if (rank < this.priorityTagEntries.length) {
				row.createSpan({
					cls: "sp-prio-badge",
					text: String(rank + 1),
					attr: { title: this.priorityTagEntries[rank].title },
				});
			}
		}
		this.renderTaskTitle(row, t);

		const meta = row.createDiv({ cls: "sp-task-meta" });
		this.renderDateBadge(meta, t, showDate);
		const pTitle =
			!isSubtask && this.selectedProjectId === null && t.projectId ? projectTitle.get(t.projectId) : undefined;
		if (pTitle) this.badge(meta, pTitle);

		const noteMatch = (t.notes || "").match(/obsidian:\/\/open\?[^)\s]*?file=([^)&\s]+)/);
		if (noteMatch) {
			const notePath = decodeURIComponent(noteMatch[1]);
			const noteBtn = row.createEl("a", { text: "📝", cls: "sp-note-link" });
			noteBtn.setAttribute("title", "Open note: " + notePath);
			noteBtn.addEventListener("click", (e) => {
				e.preventDefault();
				const file =
					this.app.vault.getAbstractFileByPath(notePath + ".md") ||
					this.app.vault.getAbstractFileByPath(notePath);
				if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
				else new Notice("Note not found: " + notePath);
			});
		}

		checkbox.addEventListener("change", () => {
			void this.completeTask(t, checkbox);
		});

		const deleteBtn = row.createEl("button", { cls: "sp-task-delete" });
		setIcon(deleteBtn, "trash-2");
		deleteBtn.setAttribute("aria-label", "Delete task");
		this.wireDeleteButton(deleteBtn, t);
	}

	/**
	 * A click "arms" the button (turns it red with a check icon) instead of
	 * popping a blocking native confirm() dialog; a second click within a
	 * few seconds actually deletes. Same one-accidental-click protection for
	 * an action SuperProductivity can't undo, without interrupting the flow
	 * of clicking through a list.
	 */
	private wireDeleteButton(deleteBtn: HTMLButtonElement, t: SPTask): void {
		let armTimeout: number | null = null;
		const disarm = () => {
			if (armTimeout !== null) {
				window.clearTimeout(armTimeout);
				armTimeout = null;
			}
			deleteBtn.removeClass("is-armed");
			setIcon(deleteBtn, "trash-2");
			deleteBtn.setAttribute("aria-label", "Delete task");
		};
		deleteBtn.addEventListener("click", () => {
			if (armTimeout === null) {
				deleteBtn.addClass("is-armed");
				setIcon(deleteBtn, "check");
				deleteBtn.setAttribute("aria-label", `Click again to delete "${t.title}"`);
				armTimeout = window.setTimeout(disarm, 3000);
				return;
			}
			disarm();
			void this.deleteTaskRow(t);
		});
		deleteBtn.addEventListener("blur", disarm);
	}

	private renderTaskTitle(row: HTMLElement, t: SPTask): void {
		const titleSpan = row.createSpan({ cls: "sp-task-title", text: t.title, attr: { title: "Click to rename" } });
		const titleInput = row.createEl("input", { type: "text", cls: "sp-task-title-input" });
		titleInput.hidden = true;

		const cancelEdit = () => {
			titleInput.hidden = true;
			titleSpan.hidden = false;
		};
		const commitEdit = () => {
			if (titleInput.hidden) return;
			const newTitle = titleInput.value.trim();
			if (!newTitle || newTitle === t.title) {
				cancelEdit();
				return;
			}
			void this.renameTask(t, newTitle, titleSpan, titleInput);
		};

		titleSpan.addEventListener("click", () => {
			titleSpan.hidden = true;
			titleInput.hidden = false;
			titleInput.value = t.title;
			titleInput.focus();
			titleInput.select();
		});
		titleInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commitEdit();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cancelEdit();
			}
		});
		titleInput.addEventListener("blur", commitEdit);
	}

	private async renameTask(t: SPTask, newTitle: string, titleSpan: HTMLElement, titleInput: HTMLInputElement): Promise<void> {
		titleInput.disabled = true;
		try {
			await this.plugin.api.patchTask(t.id, { title: newTitle });
			t.title = newTitle;
			titleSpan.setText(newTitle);
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		} finally {
			titleInput.disabled = false;
			titleInput.hidden = true;
			titleSpan.hidden = false;
		}
	}

	private renderDateBadge(meta: HTMLElement, t: SPTask, showDate: boolean): void {
		const label = showDate ? dateLabel(t) : null;
		const badge = meta.createEl("button", { cls: "sp-badge sp-date-badge" });
		if (label) badge.setText(label);
		else setIcon(badge, "calendar");
		badge.setAttribute("aria-label", "Change due date");

		const dateInput = meta.createEl("input", { type: "date", cls: "sp-date-input" });
		dateInput.hidden = true;
		if (t.dueDay) dateInput.value = t.dueDay;

		badge.addEventListener("click", () => {
			badge.hidden = true;
			dateInput.hidden = false;
			dateInput.focus();
		});
		dateInput.addEventListener("change", () => {
			if (!dateInput.value) {
				dateInput.hidden = true;
				badge.hidden = false;
				return;
			}
			void this.setDueDate(t, dateInput.value, badge, dateInput);
		});
		dateInput.addEventListener("blur", () => {
			if (!dateInput.hidden) {
				dateInput.hidden = true;
				badge.hidden = false;
			}
		});
	}

	private async setDueDate(t: SPTask, dueDay: string, badge: HTMLButtonElement, dateInput: HTMLInputElement): Promise<void> {
		dateInput.disabled = true;
		try {
			await this.plugin.api.patchTask(t.id, { dueDay });
			t.dueDay = dueDay;
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			dateInput.disabled = false;
			dateInput.hidden = true;
			badge.hidden = false;
		}
	}

	private async deleteTaskRow(t: SPTask): Promise<void> {
		try {
			await this.plugin.api.deleteTask(t.id);
			this.tasks = this.tasks.filter((x) => x.id !== t.id);
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		}
	}

	private async completeTask(t: SPTask, checkbox: HTMLInputElement): Promise<void> {
		checkbox.disabled = true;
		try {
			await this.plugin.api.patchTask(t.id, { isDone: true });
			t.isDone = true;
			this.renderGroups();
		} catch (e) {
			checkbox.disabled = false;
			checkbox.checked = false;
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
		}
	}

	private tagIdFor(title: string): string | undefined {
		if (!title) return undefined;
		return this.tags.find((t) => t.title === title)?.id;
	}

	private renderGroups(): void {
		this.groupsContainer.empty();
		const open = this.tasks.filter(
			(t) =>
				!t.isDone &&
				!t.parentId &&
				(this.selectedProjectId === null || t.projectId === this.selectedProjectId) &&
				(!this.searchQuery || t.title.toLowerCase().includes(this.searchQuery))
		);
		const today = new Date();
		const todayStr = today.toISOString().slice(0, 10);
		const weekEnd = new Date(today);
		weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
		const weekEndStr = weekEnd.toISOString().slice(0, 10);

		this.priorityTagEntries = this.plugin.settings.priorityTags
			.map((title) => ({ title, id: this.tagIdFor(title) }))
			.filter((e): e is { title: string; id: string } => !!e.id);
		const priorityTagIds = this.priorityTagEntries.map((e) => e.id);
		const rank = (t: SPTask) => prioRank(t, priorityTagIds);

		const byDueAsc = (a: SPTask, b: SPTask) => (a.dueDay ?? "").localeCompare(b.dueDay ?? "");
		const byTitle = (a: SPTask, b: SPTask) => a.title.localeCompare(b.title);
		const byPrioThenTitle = (a: SPTask, b: SPTask) => rank(a) - rank(b) || byTitle(a, b);
		const byDueThenPrio = (a: SPTask, b: SPTask) => byDueAsc(a, b) || rank(a) - rank(b);

		const groups: [string, SPTask[], boolean][] = [
			["⚠️ Overdue", open.filter((t) => t.dueDay && t.dueDay < todayStr).sort(byDueThenPrio), true],
			["📅 Due today", open.filter((t) => t.dueDay === todayStr).sort(byPrioThenTitle), false],
			[
				"🗓️ This week",
				open.filter((t) => t.dueDay && t.dueDay > todayStr && t.dueDay <= weekEndStr).sort(byDueThenPrio),
				true,
			],
			["📆 No date", open.filter((t) => !t.dueDay).sort(byPrioThenTitle), true],
		];

		for (const [label, list, showDate] of groups) {
			this.renderGroup(label, list, showDate, label.startsWith("⚠️"), todayStr);
		}

		const waitingTitle = this.plugin.settings.waitingTag.toLowerCase();
		if (waitingTitle) {
			const waitingIds = new Set(this.tags.filter((t) => t.title.toLowerCase() === waitingTitle).map((t) => t.id));
			const waiting = open.filter((t) => (t.tagIds || []).some((id) => waitingIds.has(id))).sort(byTitle);
			this.renderGroup("⏳ Waiting", waiting, true, false, todayStr);
		}
	}

	private renderGroup(label: string, list: SPTask[], showDate: boolean, allowReschedule: boolean, todayStr: string): void {
		const titleEl = this.groupsContainer.createDiv({ cls: "sp-group-title" });
		titleEl.createSpan({ text: `${label} (${list.length})` });

		if (allowReschedule && list.length > 0) {
			const rescheduleBtn = titleEl.createEl("button", { text: "→ all to today", cls: "sp-reschedule-btn" });
			rescheduleBtn.addEventListener("click", () => {
				void this.rescheduleToToday(list, todayStr, rescheduleBtn);
			});
		}

		if (list.length === 0) {
			this.groupsContainer.createDiv({ cls: "sp-group-empty", text: "none" });
			return;
		}
		for (const t of list) {
			this.renderTaskRow(this.groupsContainer, t, showDate, false);
			if (t.subTaskIds?.length) {
				const subtasks = this.tasks.filter((x) => x.parentId === t.id && !x.isDone);
				for (const sub of subtasks) this.renderTaskRow(this.groupsContainer, sub, false, true);
			}
		}
	}

	private async rescheduleToToday(list: SPTask[], todayStr: string, rescheduleBtn: HTMLButtonElement): Promise<void> {
		rescheduleBtn.disabled = true;
		try {
			await Promise.all(
				list.map((t) =>
					this.plugin.api.patchTask(t.id, { dueDay: todayStr }).then(() => {
						t.dueDay = todayStr;
					})
				)
			);
			this.renderGroups();
		} catch (e) {
			this.statusEl.setText("Error: " + getErrorMessage(e));
			this.statusEl.addClass("sp-status-error");
			rescheduleBtn.disabled = false;
		}
	}
}
