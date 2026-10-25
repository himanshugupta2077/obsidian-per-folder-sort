export const SORT_ORDERS = [
	{ id: "alphabetical", label: "File name (A to Z)" },
	{ id: "alphabeticalReverse", label: "File name (Z to A)" },
	{ id: "byModifiedTime", label: "Modified time (new to old)" },
	{ id: "byModifiedTimeReverse", label: "Modified time (old to new)" },
	{ id: "byCreatedTime", label: "Created time (new to old)" },
	{ id: "byCreatedTimeReverse", label: "Created time (old to new)" },
] as const;

export type SortOrder = (typeof SORT_ORDERS)[number]["id"];

const SORT_IDS = new Set<string>(SORT_ORDERS.map((order) => order.id));

export function isSortOrder(value: unknown): value is SortOrder {
	return typeof value === "string" && SORT_IDS.has(value);
}

export function sortLabel(order: SortOrder): string {
	const match = SORT_ORDERS.find((item) => item.id === order);
	return match ? match.label : order;
}

export function usesModifiedTime(order: SortOrder | undefined): boolean {
	return order === "byModifiedTime" || order === "byModifiedTimeReverse";
}

/** Per folder, the names of items pinned above the rest, in pin order. */
export type FolderPins = Record<string, string[]>;

export interface FolderSortData {
	folders: Record<string, SortOrder>;
	pinned: FolderPins;
}

export function sanitizeFolderSorts(raw: unknown): FolderSortData {
	const folders: Record<string, SortOrder> = {};
	const pinned: FolderPins = {};
	if (!raw || typeof raw !== "object") return { folders, pinned };
	const stored = (raw as { folders?: unknown }).folders;
	if (stored && typeof stored === "object") {
		for (const [path, order] of Object.entries(stored)) {
			if (path.length > 0 && isSortOrder(order)) folders[path] = order;
		}
	}
	const pins = (raw as { pinned?: unknown }).pinned;
	if (pins && typeof pins === "object") {
		for (const [path, names] of Object.entries(pins)) {
			if (path.length === 0 || !Array.isArray(names)) continue;
			const kept = [...new Set(names.filter((n): n is string => typeof n === "string" && n.length > 0))];
			if (kept.length > 0) pinned[path] = kept;
		}
	}
	return { folders, pinned };
}

/** Pinned items first, in pin order; everything else keeps its sorted order after them. */
export function applyPins<T>(items: T[], nameOf: (item: T) => string, pins: string[] | undefined): T[] {
	if (!pins || pins.length === 0) return items;
	const rank = new Map(pins.map((name, i) => [name, i]));
	const pinned = items.filter((item) => rank.has(nameOf(item)));
	if (pinned.length === 0) return items;
	pinned.sort((a, b) => (rank.get(nameOf(a)) ?? 0) - (rank.get(nameOf(b)) ?? 0));
	return [...pinned, ...items.filter((item) => !rank.has(nameOf(item)))];
}

function splitPath(path: string): [string, string] {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? ["/", path] : [path.slice(0, slash), path.slice(slash + 1)];
}

/**
 * Keeps pins right after a rename or move: a pinned item renamed in place stays pinned under its
 * new name, one moved to another folder is dropped, and pins inside a renamed folder follow it.
 */
export function renamePins(pins: FolderPins, oldPath: string, newPath: string): FolderPins {
	if (oldPath === newPath || oldPath === "/" || oldPath.length === 0) return pins;
	const [oldParent, oldName] = splitPath(oldPath);
	const [newParent, newName] = splitPath(newPath);
	const next: FolderPins = {};
	let changed = false;
	const prefix = `${oldPath}/`;
	for (const [path, names] of Object.entries(pins)) {
		let key = path;
		if (path === oldPath) key = newPath;
		else if (path.startsWith(prefix)) key = newPath + path.slice(oldPath.length);
		let list = names;
		if (path === oldParent && names.includes(oldName)) {
			list = oldParent === newParent ? names.map((n) => (n === oldName ? newName : n)) : names.filter((n) => n !== oldName);
		}
		if (key !== path || list !== names) changed = true;
		if (list.length > 0) next[key] = list;
	}
	return changed ? next : pins;
}

/** Drops pins for a deleted item, and every pin inside a deleted folder. */
export function removePins(pins: FolderPins, deletedPath: string): FolderPins {
	if (deletedPath.length === 0) return pins;
	const [parent, name] = splitPath(deletedPath);
	const next: FolderPins = {};
	let changed = false;
	const prefix = `${deletedPath}/`;
	for (const [path, names] of Object.entries(pins)) {
		if (path === deletedPath || path.startsWith(prefix)) {
			changed = true;
			continue;
		}
		const list = path === parent ? names.filter((n) => n !== name) : names;
		if (list !== names && list.length !== names.length) changed = true;
		if (list.length > 0) next[path] = list;
	}
	return changed ? next : pins;
}

/**
 * Run Obsidian's own folder sort while `sortOrder` is temporarily the
 * folder override. Restores the vault order even when sorting throws.
 */
export function withSortOrder<T>(
	current: string,
	override: string | undefined,
	setOrder: (order: string) => void,
	run: () => T
): T {
	if (!override || override === current) return run();
	setOrder(override);
	try {
		return run();
	} finally {
		setOrder(current);
	}
}

export function renameFolderSorts(
	folders: Record<string, SortOrder>,
	oldPath: string,
	newPath: string
): Record<string, SortOrder> {
	if (oldPath === newPath || oldPath === "/" || oldPath.length === 0) {
		return folders;
	}
	const next: Record<string, SortOrder> = {};
	let changed = false;
	const prefix = `${oldPath}/`;
	for (const [path, order] of Object.entries(folders)) {
		if (path === oldPath) {
			next[newPath] = order;
			changed = true;
		} else if (path.startsWith(prefix)) {
			next[newPath + path.slice(oldPath.length)] = order;
			changed = true;
		} else {
			next[path] = order;
		}
	}
	return changed ? next : folders;
}

export function removeFolderSorts(
	folders: Record<string, SortOrder>,
	deletedPath: string
): Record<string, SortOrder> {
	if (deletedPath.length === 0) return folders;
	const next: Record<string, SortOrder> = {};
	let changed = false;
	const prefix = `${deletedPath}/`;
	for (const [path, order] of Object.entries(folders)) {
		if (path === deletedPath || path.startsWith(prefix)) {
			changed = true;
			continue;
		}
		next[path] = order;
	}
	return changed ? next : folders;
}
