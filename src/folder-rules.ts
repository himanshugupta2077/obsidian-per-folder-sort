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

export interface FolderSortData {
	folders: Record<string, SortOrder>;
}

export function sanitizeFolderSorts(raw: unknown): FolderSortData {
	const folders: Record<string, SortOrder> = {};
	if (!raw || typeof raw !== "object") return { folders };
	const stored = (raw as { folders?: unknown }).folders;
	if (!stored || typeof stored !== "object") return { folders };
	for (const [path, order] of Object.entries(stored)) {
		if (path.length > 0 && isSortOrder(order)) folders[path] = order;
	}
	return { folders };
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
