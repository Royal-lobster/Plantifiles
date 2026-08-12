import { describe, expect, it } from "vitest";
import { lint } from "./lint.js";
import { parseSource } from "./syntax.js";

/**
 * The renderer parses with `remark-gfm`. Core must too, or the two disagree about
 * what Markdown means and the linter blocks valid documents for the wrong reason.
 * These are the two shapes that actually broke.
 */
describe("gfm parity with the renderer", () => {
	it("parses a table as a table rather than one long paragraph", () => {
		const { tree } = parseSource(["| a | b |", "| --- | --- |", "| 1 | 2 |", ""].join("\n"));
		expect(tree.children.map((node) => node.type)).toContain("table");
	});

	it("reads task list state instead of leaving brackets in the text", () => {
		const { tree } = parseSource(["- [ ] first", "- [x] second", ""].join("\n"));
		const list = tree.children.find((node) => node.type === "list");
		expect(list).toBeDefined();
		if (list?.type !== "list") throw new Error("expected a list node");
		expect(list.children.map((item) => item.checked)).toEqual([false, true]);
	});

	it("does not blame paragraph length for a wide comparison table", () => {
		const rows = [
			"| Provider | Setup | Latency | Cost | Rollback |",
			"| --- | --- | --- | --- | --- |",
			"| GitHub App | Moderate installation flow for each workspace | Low, driven by webhooks | Free inside the existing plan | Immediate, uninstall the app |",
			"| Polling worker | Trivial, needs no third party install | High, bounded by the cron interval | Billed per row read on every scan | Immediate, disable the trigger |",
		];
		const source = [
			"---",
			"title: Comparison",
			"---",
			"",
			"<TLDR>",
			"Pick a drift provider by comparing setup cost, latency, and rollback story.",
			"</TLDR>",
			"",
			"## Providers",
			"",
			"Each candidate scored against the criteria that decide the rollout.",
			"",
			...rows,
			"",
			'<Decision owner="@srujan">',
			"Which provider should carry the first rollout?",
			"</Decision>",
			"",
			'<Diagram lang="mermaid">',
			"```mermaid",
			"graph LR",
			"  A[event] --> B[queue]",
			"```",
			"</Diagram>",
			"",
			'<Phase n="1" title="Ship the webhook">',
			"- [ ] verify signatures",
			"</Phase>",
			"",
		].join("\n");
		expect(lint(source).findings.filter((finding) => finding.rule === "paragraph-length")).toEqual([]);
	});
});
