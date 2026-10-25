import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	applyPins,
	isSortOrder,
	removePins,
	renamePins,
	removeFolderSorts,
	renameFolderSorts,
	sanitizeFolderSorts,
	withSortOrder,
} from "./folder-rules.ts";

describe("sanitizeFolderSorts", () => {
	it("keeps only known sort orders", () => {
		const data = sanitizeFolderSorts({
			folders: {
				"/": "alphabetical",
				Notes: "byModifiedTime",
				Bad: "manual",
				"": "alphabetical",
			},
		});
		assert.deepEqual(data.folders, {
			"/": "alphabetical",
			Notes: "byModifiedTime",
		});
	});

	it("returns an empty map for missing data", () => {
		assert.deepEqual(sanitizeFolderSorts(null).folders, {});
		assert.deepEqual(sanitizeFolderSorts({}).folders, {});
		assert.deepEqual(sanitizeFolderSorts({ folders: null }).folders, {});
	});
});

describe("isSortOrder", () => {
	it("accepts the six file explorer orders", () => {
		assert.equal(isSortOrder("alphabeticalReverse"), true);
		assert.equal(isSortOrder("byCreatedTimeReverse"), true);
		assert.equal(isSortOrder("custom"), false);
		assert.equal(isSortOrder(1), false);
	});
});

describe("withSortOrder", () => {
	it("leaves the vault order alone when the folder has no override", () => {
		const seen: string[] = [];
		const result = withSortOrder(
			"alphabetical",
			undefined,
			(order) => seen.push(order),
			() => "sorted"
		);
		assert.equal(result, "sorted");
		assert.deepEqual(seen, []);
	});

	it("swaps in the folder order and restores the vault order", () => {
		let current = "alphabetical";
		let seen = "";
		withSortOrder(
			current,
			"byModifiedTime",
			(order) => {
				current = order;
			},
			() => {
				seen = current;
			}
		);
		assert.equal(seen, "byModifiedTime");
		assert.equal(current, "alphabetical");
	});

	it("restores the vault order when sorting throws", () => {
		let current = "alphabetical";
		assert.throws(() =>
			withSortOrder(
				current,
				"byCreatedTime",
				(order) => {
					current = order;
				},
				() => {
					throw new Error("sort failed");
				}
			)
		);
		assert.equal(current, "alphabetical");
	});
});

describe("renameFolderSorts", () => {
	it("moves the folder and its nested overrides", () => {
		const next = renameFolderSorts(
			{
				"Notes/A": "alphabeticalReverse",
				"Notes/A/Nested": "byCreatedTime",
				"Notes/AB": "byModifiedTime",
				Other: "alphabetical",
			},
			"Notes/A",
			"Archive/A"
		);
		assert.deepEqual(next, {
			"Archive/A": "alphabeticalReverse",
			"Archive/A/Nested": "byCreatedTime",
			"Notes/AB": "byModifiedTime",
			Other: "alphabetical",
		});
	});

	it("returns the same map when nothing matches", () => {
		const folders = { Notes: "alphabetical" as const };
		assert.equal(renameFolderSorts(folders, "Missing", "Next"), folders);
		assert.equal(renameFolderSorts(folders, "/", "Next"), folders);
	});
});

describe("removeFolderSorts", () => {
	it("drops the folder and nested overrides, and keeps siblings", () => {
		const next = removeFolderSorts(
			{
				Notes: "alphabetical",
				"Notes/A": "byModifiedTimeReverse",
				"Notes-extra": "byCreatedTimeReverse",
			},
			"Notes"
		);
		assert.deepEqual(next, {
			"Notes-extra": "byCreatedTimeReverse",
		});
	});
});

describe("pins", () => {
	const name = (s: string) => s;

	it("puts pinned items first in pin order and keeps the rest in sorted order", () => {
		const items = ["Daily", "Detection", "Governance", "Infrastructure", "Me", "Product"];
		assert.deepEqual(applyPins(items, name, ["Governance", "Product", "Infrastructure", "Detection"]), [
			"Governance",
			"Product",
			"Infrastructure",
			"Detection",
			"Daily",
			"Me",
		]);
		assert.equal(applyPins(items, name, undefined), items);
		assert.deepEqual(applyPins(items, name, ["Missing"]), items);
	});

	it("sanitizes stored pins", () => {
		const data = sanitizeFolderSorts({ pinned: { A: ["x", "x", 3, ""], B: [], "": ["y"], C: "z" } });
		assert.deepEqual(data.pinned, { A: ["x"] });
		assert.deepEqual(sanitizeFolderSorts(null).pinned, {});
	});

	it("follows renames and moves", () => {
		const pins = { "Work/PL": ["Gov", "Prod"], "Work/PL/Gov": ["SOC 2"] };
		assert.deepEqual(renamePins(pins, "Work/PL/Gov", "Work/PL/Governance"), {
			"Work/PL": ["Governance", "Prod"],
			"Work/PL/Governance": ["SOC 2"],
		});
		assert.deepEqual(renamePins(pins, "Work/PL/Prod", "Elsewhere/Prod"), {
			"Work/PL": ["Gov"],
			"Work/PL/Gov": ["SOC 2"],
		});
		assert.deepEqual(renamePins(pins, "Work", "Job"), { "Job/PL": ["Gov", "Prod"], "Job/PL/Gov": ["SOC 2"] });
		assert.equal(renamePins(pins, "Other", "Else"), pins);
	});

	it("drops pins on delete", () => {
		const pins = { "Work/PL": ["Gov", "Prod"], "Work/PL/Gov": ["SOC 2"] };
		assert.deepEqual(removePins(pins, "Work/PL/Gov"), { "Work/PL": ["Prod"] });
		assert.equal(removePins(pins, "Other"), pins);
	});
});
