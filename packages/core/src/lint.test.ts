import { describe, expect, it } from "vitest";
import { EXAMPLE_PLAN } from "./example.js";
import { analyzePlan, lint } from "./lint.js";

function findingsFor(source: string, rule: string) {
	return lint(source).findings.filter((finding) => finding.rule === rule);
}

describe("lint", () => {
	it("accepts a document meeting every lint rule", () => {
		const report = lint(EXAMPLE_PLAN);
		expect(report).toMatchObject({ errors: 0, warnings: 0, score: 100, canPublish: true });
		expect(report.findings).toEqual([]);
	});

	it("requires exactly one TLDR", () => {
		const source = EXAMPLE_PLAN.replace("<TLDR>", '<Callout kind="note">').replace("</TLDR>", "</Callout>");
		expect(findingsFor(source, "tldr-position")[0]?.message).toContain("exactly one");
	});

	it("requires TLDR to be the first block", () => {
		const source = EXAMPLE_PLAN.replace("<TLDR>", "An introductory paragraph.\n\n<TLDR>");
		expect(findingsFor(source, "tldr-position")[0]?.message).toContain("first block");
	});

	it("rejects a TLDR over 60 words", () => {
		const source = EXAMPLE_PLAN.replace(
			"Move subscription billing from the homegrown ledger to Stripe over three phases, keeping the ledger as read-only history.",
			Array.from({ length: 61 }, () => "word").join(" "),
		);
		expect(findingsFor(source, "tldr-length")).toHaveLength(1);
	});

	it("requires a short one-line summary after every level-two heading", () => {
		const source = EXAMPLE_PLAN.replace(
			"The current ledger has costly proration errors and no clear owner.",
			"This summary is deliberately\nwrapped across lines.",
		);
		expect(findingsFor(source, "section-summary")).toHaveLength(1);
	});

	it("rejects paragraphs over five sentences", () => {
		const source = `${EXAMPLE_PLAN}\nOne. Two. Three. Four. Five. Six.\n`;
		expect(findingsFor(source, "paragraph-length")).toHaveLength(1);
	});

	it("rejects paragraphs over 120 words", () => {
		const source = `${EXAMPLE_PLAN}\n${Array.from({ length: 121 }, () => "word").join(" ")}\n`;
		expect(findingsFor(source, "paragraph-length")).toHaveLength(1);
	});

	it.each(["Decision", "Phase", "Diagram"])("requires at least one %s", (component) => {
		const source = EXAMPLE_PLAN.replace(new RegExp(`<${component}[^>]*>[\\s\\S]*?</${component}>`, "g"), "");
		expect(findingsFor(source, "required-components").some((finding) => finding.message.includes(component))).toBe(
			true,
		);
	});

	it("requires an owner on every Decision", () => {
		const source = EXAMPLE_PLAN.replace(' owner="@srujan"', "");
		expect(findingsFor(source, "decision-owner")).toHaveLength(1);
	});

	it("requires two options and exactly one recommendation", () => {
		const source = EXAMPLE_PLAN.replace(" recommended", "");
		expect(findingsFor(source, "tradeoff-options")[0]?.message).toContain("exactly one");
	});

	it("restricts risk severity", () => {
		const source = EXAMPLE_PLAN.replace('severity="high"', 'severity="critical"');
		expect(findingsFor(source, "risk-severity")).toHaveLength(1);
	});

	it("rejects headings deeper than level three", () => {
		const source = `${EXAMPLE_PLAN}\n#### Implementation detail\n`;
		expect(findingsFor(source, "heading-depth")).toHaveLength(1);
	});

	it("rejects components outside the vocabulary", () => {
		const source = `${EXAMPLE_PLAN}\n<Accordion>Unsupported</Accordion>\n`;
		expect(findingsFor(source, "component-vocabulary")[0]?.message).toContain("Accordion");
	});

	it("rejects raw HTML", () => {
		const source = `${EXAMPLE_PLAN}\n<div>Unsupported</div>\n`;
		expect(findingsFor(source, "component-vocabulary").length).toBeGreaterThan(0);
	});

	it("requires block component children on their own lines", () => {
		const source = EXAMPLE_PLAN.replace(
			'<Decision owner="@srujan" id="historical-invoices">\nDo we backfill historical invoices into Stripe, or leave them in the read-only ledger?\n</Decision>',
			'<Decision owner="@srujan" id="historical-invoices">Do we backfill historical invoices into Stripe?</Decision>',
		);
		const findings = findingsFor(source, "block-children-lines");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("<Decision>");
	});

	it.each([
		["Option name", EXAMPLE_PLAN.replace(' name="Backfill everything"', ""), "<Option> requires a name prop."],
		["Rejected what", EXAMPLE_PLAN.replace(' what="Chargebee"', ""), "<Rejected> requires a what prop."],
		["Phase n", EXAMPLE_PLAN.replace(' n="1"', ""), "<Phase> requires a n prop."],
		["Phase title", EXAMPLE_PLAN.replace(' title="Dual-write"', ""), "<Phase> requires a title prop."],
		[
			"Diagram language",
			EXAMPLE_PLAN.replace('lang="mermaid"', 'lang="dot"'),
			'<Diagram> requires lang="mermaid" or lang="d2" and exactly one fenced code block.',
		],
		[
			"Diagram fenced code count",
			EXAMPLE_PLAN.replace("```\n</Diagram>", "```\n\n```mermaid\ngraph TD\n  A --> B\n```\n</Diagram>"),
			'<Diagram> requires lang="mermaid" or lang="d2" and exactly one fenced code block.',
		],
		[
			"CodeSketch language",
			`${EXAMPLE_PLAN}\n<CodeSketch>\n\`\`\`ts\nconst ready = true;\n\`\`\`\n</CodeSketch>\n`,
			"<CodeSketch> requires a lang prop.",
		],
		[
			"CodeSketch fenced code count",
			`${EXAMPLE_PLAN}\n<CodeSketch lang="ts">\nDescribe the interface.\n</CodeSketch>\n`,
			"<CodeSketch> requires exactly one fenced code block.",
		],
		[
			"Callout kind",
			`${EXAMPLE_PLAN}\n<Callout kind="tip">\nUnsupported kind.\n</Callout>\n`,
			'<Callout> kind must be "note" or "warning".',
		],
	])("enforces the %s grammar", (_branch, source, message) => {
		expect(findingsFor(source, "component-vocabulary").some((finding) => finding.message === message)).toBe(true);
	});

	it("accepts every supported component grammar branch", () => {
		const source = `${EXAMPLE_PLAN.replace('lang="mermaid"', 'lang="d2"').replace('severity="high"', 'severity="med"')}
<CodeSketch lang="ts">
\`\`\`ts
const ready = true;
\`\`\`
</CodeSketch>

<Callout kind="warning">
Check the rollback signal.
</Callout>
`;

		expect(findingsFor(source, "component-vocabulary")).toEqual([]);
		expect(findingsFor(source, "risk-severity")).toEqual([]);
	});

	it("rejects a Decision nested inside an Option and attributes it to the containing block", () => {
		const source = EXAMPLE_PLAN.replace(
			`  <Option name="Backfill everything">
    One source of truth. Two weeks of work, risky mapping of legacy plans.
  </Option>`,
			`  <Option name="Backfill everything">
    <Decision owner="@nested">
      Should this Decision be nested?
    </Decision>
  </Option>`,
		);
		const analysis = analyzePlan(source);
		const containingBlock = analysis.blocks.find((block) => block.kind === "Tradeoff");
		if (!containingBlock) throw new Error("expected the containing Tradeoff block");
		const [finding] = analysis.report.findings.filter(
			(item) => item.rule === "component-placement" && item.message.includes("<Decision>"),
		);
		expect(finding).toMatchObject({
			severity: "error",
			line: source.slice(0, source.indexOf('<Decision owner="@nested">')).split("\n").length,
			blockKey: containingBlock.key,
		});
		expect(analysis.canPersist).toBe(false);
	});

	it("rejects an Option that is not a direct Tradeoff child", () => {
		const source = EXAMPLE_PLAN.replace(
			`  <Option name="Backfill everything">
    One source of truth. Two weeks of work, risky mapping of legacy plans.
  </Option>`,
			`  <Callout kind="note">
    <Option name="Backfill everything">
      One source of truth.
    </Option>
  </Callout>`,
		);
		const analysis = analyzePlan(source);
		const containingBlock = analysis.blocks.find((block) => block.kind === "Tradeoff");
		if (!containingBlock) throw new Error("expected the containing Tradeoff block");
		const [finding] = analysis.report.findings.filter(
			(item) => item.rule === "component-placement" && item.message.includes("<Option>"),
		);
		expect(finding).toMatchObject({
			severity: "error",
			line: source.slice(0, source.indexOf('<Option name="Backfill everything">')).split("\n").length,
			blockKey: containingBlock.key,
		});
		expect(analysis.canPersist).toBe(false);
	});

	it.each(["Plan_1", "plan-1", "A"])("accepts fragment-safe explicit id %s", (id) => {
		const source = EXAMPLE_PLAN.replace('id="historical-invoices"', `id="${id}"`);
		expect(findingsFor(source, "component-id")).toEqual([]);
	});

	it.each(['id="1-starts-with-a-digit"', 'id="contains a space"', 'id="contains/a/slash"', 'id=""', "id={dynamicId}"])(
		"rejects malformed explicit %s",
		(attribute) => {
			const source = EXAMPLE_PLAN.replace('id="historical-invoices"', attribute);
			const analysis = analyzePlan(source);
			const report = analysis.report;
			const containingBlock = analysis.blocks.find((block) => block.kind === "Decision");
			if (!containingBlock) throw new Error("expected the containing Decision block");

			expect(report.findings.filter((finding) => finding.rule === "component-id")).toEqual([
				expect.objectContaining({
					severity: "error",
					line: 14,
					blockKey: containingBlock.key,
				}),
			]);
			expect(report.canPublish).toBe(false);
			expect(analysis.canPersist).toBe(false);
		},
	);

	it("reports every occurrence of a duplicate explicit id with its source line and block", () => {
		const source = EXAMPLE_PLAN.replace('<Risk severity="high">', '<Risk id="historical-invoices" severity="high">');
		const analysis = analyzePlan(source);
		const report = analysis.report;

		expect(report.findings.filter((finding) => finding.rule === "component-id")).toEqual([
			expect.objectContaining({ line: 14, blockKey: "historical-invoices" }),
			expect.objectContaining({ line: 54, blockKey: "historical-invoices" }),
		]);
		expect(report.canPublish).toBe(false);
		expect(analysis.canPersist).toBe(false);
	});

	it("warns without an emoji and still permits publishing", () => {
		const source = EXAMPLE_PLAN.replace("emoji: 🧾\n", "");
		const report = lint(source);
		expect(report.findings.filter((finding) => finding.rule === "plan-emoji")).toEqual([
			expect.objectContaining({
				severity: "warning",
				message: "Choose one emoji that represents the plan and add it to frontmatter.",
			}),
		]);
		expect(report.canPublish).toBe(true);
	});

	it("accepts an emoji supplied outside frontmatter", () => {
		const source = EXAMPLE_PLAN.replace("emoji: 🧾\n", "");
		expect(lint(source, { emoji: "🛡️" }).findings.some((finding) => finding.rule === "plan-emoji")).toBe(false);
	});

	it("warns when no rejected alternative is recorded", () => {
		const source = EXAMPLE_PLAN.replace(/<Rejected[\s\S]*?<\/Rejected>\n/, "");
		expect(findingsFor(source, "rejected-alternative")).toHaveLength(1);
	});

	it("warns when the plan carries fewer than two diagrams", () => {
		const source = EXAMPLE_PLAN.replace(/<Diagram[\s\S]*?<\/Diagram>\n/, "");
		const report = lint(source);
		const findings = report.findings.filter((finding) => finding.rule === "diagram-count");
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			severity: "warning",
			message: "Plan has 1 diagram; use at least two and vary the diagram type.",
		});
		expect(report.canPublish).toBe(true);
		expect(report.score).toBe(lint(EXAMPLE_PLAN).score - 3);
	});

	it("accepts a plan with two diagrams", () => {
		expect(findingsFor(EXAMPLE_PLAN, "diagram-count")).toEqual([]);
	});

	it("warns when read time exceeds twelve minutes", () => {
		const paragraph = Array.from({ length: 100 }, () => "word").join(" ");
		const source = `${EXAMPLE_PLAN}\n${Array.from({ length: 25 }, () => paragraph).join("\n\n")}\n`;
		const report = lint(source);
		expect(findingsFor(source, "read-time")).toHaveLength(1);
		expect(report.readTimeMinutes).toBeGreaterThan(12);
	});

	it("calculates the publish score from errors and warnings", () => {
		const source = EXAMPLE_PLAN.replace(' owner="@srujan"', "").replace(/<Rejected[\s\S]*?<\/Rejected>\n/, "");
		expect(lint(source)).toMatchObject({ errors: 1, warnings: 1, score: 87, canPublish: false });
	});
});
