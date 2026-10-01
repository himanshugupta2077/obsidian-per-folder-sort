import {
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFolder,
	type Menu,
	type MenuItem,
} from "obsidian";
import {
	SORT_ORDERS,
	isSortOrder,
	removeFolderSorts,
	renameFolderSorts,
	sanitizeFolderSorts,
	sortLabel,
	usesModifiedTime,
	withSortOrder,
	type FolderSortData,
	type SortOrder,
} from "./folder-rules";

declare module "obsidian" {
	interface MenuItem {
		setSubmenu(): Menu;
	}
}

const FILE_EXPLORER = "file-explorer";
const MENU_SOURCE = "file-explorer-context-menu";

interface FileExplorerView {
	sortOrder: string;
	getSortedFolderItems: (folder: TFolder) => unknown;
	requestSort?: () => void;
	sort?: () => void;
}

interface ExplorerPrototype {
	getSortedFolderItems: (this: FileExplorerView, folder: TFolder) => unknown;
}

interface InstalledPatch {
	original: ExplorerPrototype["getSortedFolderItems"];
	wrapped: ExplorerPrototype["getSortedFolderItems"];
}

export default class PerFolderSortPlugin extends Plugin {
	data: FolderSortData = { folders: {} };
	private patches = new Map<object, InstalledPatch>();
	private warned = false;

	override async onload(): Promise<void> {
		this.data = sanitizeFolderSorts(await this.loadData());
		this.addSettingTab(new PerFolderSortSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file, source) => {
				this.addSortMenu(menu, file, source);
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.onRename(file, oldPath);
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.onDelete(file);
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				this.onModify(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.tryPatch();
			})
		);
		this.app.workspace.onLayoutReady(() => {
			this.tryPatch();
		});
	}

	override onunload(): void {
		for (const [proto, patch] of this.patches) {
			const target = proto as ExplorerPrototype;
			if (target.getSortedFolderItems === patch.wrapped) {
				target.getSortedFolderItems = patch.original;
			}
		}
		this.patches.clear();
		this.resort();
	}

	setFolderSort(folder: TFolder, order: SortOrder): void {
		if (this.data.folders[folder.path] === order) return;
		this.data.folders[folder.path] = order;
		void this.saveData(this.data);
		this.resort();
	}

	clearFolderSort(path: string): void {
		if (!Object.prototype.hasOwnProperty.call(this.data.folders, path)) {
			return;
		}
		delete this.data.folders[path];
		void this.saveData(this.data);
		this.resort();
	}

	clearAll(): void {
		if (Object.keys(this.data.folders).length === 0) return;
		this.data.folders = {};
		void this.saveData(this.data);
		this.resort();
	}

	private addSortMenu(
		menu: Menu,
		file: TAbstractFile,
		source: string
	): void {
		if (source !== MENU_SOURCE || !(file instanceof TFolder)) return;
		const current = this.data.folders[file.path];
		const vaultOrder = this.vaultSortOrder();
		menu.addItem((item) => {
			item
				.setTitle(
					isSortOrder(current) ? `Sort: ${sortLabel(current)}` : "Sort"
				)
				.setIcon("arrow-up-down")
				.setSection("action");
			const submenu = item.setSubmenu();
			submenu.setNoIcon();
			submenu.addItem((sub) => {
				const vaultLabel = vaultOrder
					? `Use vault sort (${sortLabel(vaultOrder)})`
					: "Use vault sort";
				sub
					.setTitle(vaultLabel)
					.setChecked(!isSortOrder(current))
					.onClick(() => {
						this.clearFolderSort(file.path);
					});
			});
			submenu.addSeparator();
			for (const option of SORT_ORDERS) {
				submenu.addItem((sub) => {
					this.addOrderItem(sub, file, option.id, current);
				});
			}
		});
	}

	private addOrderItem(
		item: MenuItem,
		folder: TFolder,
		order: SortOrder,
		current: SortOrder | undefined
	): void {
		item
			.setTitle(sortLabel(order))
			.setChecked(current === order)
			.onClick(() => {
				this.setFolderSort(folder, order);
			});
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFolder)) return;
		const next = renameFolderSorts(this.data.folders, oldPath, file.path);
		if (next === this.data.folders) return;
		this.data.folders = next;
		void this.saveData(this.data);
	}

	private onDelete(file: TAbstractFile): void {
		if (!(file instanceof TFolder)) return;
		const next = removeFolderSorts(this.data.folders, file.path);
		if (next === this.data.folders) return;
		this.data.folders = next;
		void this.saveData(this.data);
	}

	private onModify(file: TAbstractFile): void {
		const parent = file.parent;
		if (!parent) return;
		const order = this.data.folders[parent.path];
		if (usesModifiedTime(order)) this.resort();
	}

	private vaultSortOrder(): SortOrder | null {
		const leaf = this.app.workspace.getLeavesOfType(FILE_EXPLORER)[0];
		const order = (leaf?.view as Partial<FileExplorerView> | undefined)
			?.sortOrder;
		return isSortOrder(order) ? order : null;
	}

	private tryPatch(): void {
		const leaves = this.app.workspace.getLeavesOfType(FILE_EXPLORER);
		if (leaves.length === 0) return;
		let hooked = false;
		let installed = false;
		for (const leaf of leaves) {
			const view = leaf.view as Partial<FileExplorerView>;
			const proto = Object.getPrototypeOf(view) as ExplorerPrototype | null;
			if (!proto || typeof proto.getSortedFolderItems !== "function") {
				continue;
			}
			hooked = true;
			if (this.patches.has(proto)) continue;
			this.installPatch(proto);
			installed = true;
		}
		if (installed) this.resort();
		if (hooked) return;
		if (!this.warned) {
			this.warned = true;
			new Notice(
				"Per-folder sort could not hook the file explorer. Reload Obsidian after updating."
			);
		}
	}

	private installPatch(proto: ExplorerPrototype): void {
		if (this.patches.has(proto)) return;
		const original = proto.getSortedFolderItems;
		const plugin = this;
		const wrapped: ExplorerPrototype["getSortedFolderItems"] = function (
			this: FileExplorerView,
			folder: TFolder
		) {
			const override = folder ? plugin.data.folders[folder.path] : undefined;
			return withSortOrder(
				this.sortOrder,
				isSortOrder(override) ? override : undefined,
				(order) => {
					this.sortOrder = order;
				},
				() => original.call(this, folder)
			);
		};
		proto.getSortedFolderItems = wrapped;
		const patch = { original, wrapped };
		this.patches.set(proto, patch);
		this.register(() => {
			if (proto.getSortedFolderItems === wrapped) {
				proto.getSortedFolderItems = original;
			}
			this.patches.delete(proto);
		});
	}

	private resort(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(FILE_EXPLORER)) {
			const view = leaf.view as Partial<FileExplorerView>;
			if (typeof view.requestSort === "function") view.requestSort();
			else view.sort?.();
		}
	}
}

class PerFolderSortSettingTab extends PluginSettingTab {
	constructor(
		app: ConstructorParameters<typeof PluginSettingTab>[0],
		private readonly plugin: PerFolderSortPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			text: "Right-click a folder in the file explorer and choose Sort. That folder keeps the order you pick. Every folder you leave alone keeps using the sort button at the top of the file explorer. Right-click the empty space under the file list to set the vault root. An override applies to the items directly inside that folder. A subfolder keeps the vault sort until you set one on it.",
		});
		containerEl.createEl("p", {
			text: "Notes use the order you pick. Subfolders stay above the notes and stay in name order. That is the same rule the vault sort already uses.",
		});

		const entries = Object.entries(this.plugin.data.folders).sort(([a], [b]) =>
			a.localeCompare(b)
		);
		if (entries.length === 0) {
			containerEl.createEl("p", {
				text: "No folder overrides yet.",
			});
			return;
		}

		for (const [path, order] of entries) {
			new Setting(containerEl)
				.setName(path === "/" ? "Vault root" : path)
				.setDesc(sortLabel(order))
				.addButton((button) => {
					button.setButtonText("Use vault sort").onClick(() => {
						this.plugin.clearFolderSort(path);
						this.display();
					});
				});
		}

		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText("Clear all overrides")
				.setWarning()
				.onClick(() => {
					this.plugin.clearAll();
					this.display();
				});
		});
	}
}
