import { describe, expect, it } from "vitest";
import { diff } from "./diff.js";
import { EXAMPLE_PLAN } from "./example.js";
import { analyzePlan } from "./index.js";
import { normalize } from "./normalize.js";

describe("analyzePlan", () => {
	it("returns normalized blocks, the parsed tree, and a clean report from one analysis", () => {
		const analysis = analyzePlan(EXAMPLE_PLAN);

		expect(analysis.blocks).toEqual(normalize(EXAMPLE_PLAN));
		expect(analysis).toMatchObject({ canPersist: true });
		expect(analysis.report).toMatchObject({ errors: 0, score: 100, canPublish: true });
	});

	it("reports parse failures without producing persistable blocks", () => {
		const analysis = analyzePlan("<Decision>\nThis block never closes.");

		expect(analysis.canPersist).toBe(false);
		expect(analysis.blocks).toEqual([]);
		expect(analysis.tree).toBeUndefined();
		expect(analysis.report).toMatchObject({
			errors: 1,
			canPublish: false,
			findings: [expect.objectContaining({ rule: "valid-mdx", severity: "error", line: 1 })],
		});
	});
});

describe("normalize", () => {
	it("keeps block keys stable when content changes under the same heading path", () => {
		const nextVersion = EXAMPLE_PLAN.replace("costly proration errors", "frequent proration errors").replace(
			"Webhook replay could double-charge.",
			"Delayed webhook replay could double-charge.",
		);
		expect(normalize(nextVersion).map((block) => block.key)).toEqual(normalize(EXAMPLE_PLAN).map((block) => block.key));
	});

	it("uses an explicit id as the block key", () => {
		const decision = normalize(EXAMPLE_PLAN).find((block) => block.kind === "Decision");
		expect(decision?.key).toBe("historical-invoices");
	});

	it("normalizes line endings before hashing", () => {
		expect(normalize(EXAMPLE_PLAN.replace(/\n/g, "\r\n"))).toEqual(normalize(EXAMPLE_PLAN));
	});
});

describe("diff", () => {
	it("classifies added, removed, modified, and moved blocks", () => {
		const previous = normalize(`<TLDR id="summary">
Short summary.
</TLDR>

<Decision id="choice" owner="@dev">
Old?
</Decision>

<Risk id="gone" severity="low">
Gone.
</Risk>`);
		const next = normalize(`An inserted paragraph.

<TLDR id="summary">
Short summary.
</TLDR>

<Decision id="choice" owner="@dev">
New?
</Decision>

<Phase id="new" n="1" title="Build">
- [ ] Ship
</Phase>`);
		const result = diff(previous, next);

		expect(result.changes.map((change) => [change.key, change.type])).toEqual([
			["summary", "moved"],
			["choice", "modified"],
			["gone", "removed"],
			["root:paragraph:1", "added"],
			["new", "added"],
		]);
		expect(result.summary).toBe(
			"Removed Risk. Added Paragraph and Phase (Build). Modified Decision (New?). Moved TLDR.",
		);
	});

	it("groups summary kinds with counts and a final conjunction", () => {
		const previous = normalize(`<Risk id="first-risk" severity="low">
First.
</Risk>

<Risk id="second-risk" severity="high">
Second.
</Risk>

<Decision id="decision" owner="@dev">
Ship?
</Decision>`);

		expect(diff(previous, []).summary).toBe("Removed 2 Risks and Decision (Ship?).");
	});

	it("reports a changed and reordered block only as modified", () => {
		const previous = normalize(`<Decision id="choice" owner="@dev">
Old?
</Decision>`);
		const next = normalize(`Inserted first.

<Decision id="choice" owner="@dev">
New?
</Decision>`);

		expect(diff(previous, next).changes.map(({ key, type }) => [key, type])).toEqual([
			["choice", "modified"],
			["root:paragraph:1", "added"],
		]);
	});

	it("reports no structural changes for identical blocks", () => {
		const blocks = normalize(EXAMPLE_PLAN);
		expect(diff(blocks, blocks)).toEqual({ changes: [], summary: "No structural changes." });
	});
});
