import { describe, expect, it } from "vitest";
import { EXAMPLE_GUIDED_PLAN, EXAMPLE_LESSON, EXAMPLE_PLAN } from "./example.js";
import { analyzePlan, lint } from "./lint.js";

function findingsFor(source: string, rule: string) {
	return lint(source).findings.filter((finding) => finding.rule === rule);
}

describe("profile-aware lint", () => {
	it.each([
		["plan", EXAMPLE_PLAN],
		["lesson", EXAMPLE_LESSON],
		["guided-plan", EXAMPLE_GUIDED_PLAN],
	])("accepts a complete %s", (_profile, source) => {
		const analysis = analyzePlan(source);
		expect(analysis.report).toMatchObject({ errors: 0, warnings: 0, score: 100, canPublish: true });
		expect(analysis.report.findings).toEqual([]);
	});

	it("returns parsed profile metadata with the analysis", () => {
		expect(analyzePlan(EXAMPLE_GUIDED_PLAN).metadata).toEqual({
			title: "Make webhook replay safe",
			profile: "guided-plan",
			emoji: "🔁",
			audience: "Engineers reviewing and implementing the webhook cutover",
			outcomes: [
				"Predict the failure caused by separate commits",
				"Apply the transactional interface to every handler",
			],
		});
	});

	it("requires frontmatter, title, and kind", () => {
		const noFrontmatter = EXAMPLE_PLAN.replace(/^---[\s\S]*?---\n\n/, "");
		expect(findingsFor(noFrontmatter, "frontmatter-required")).toHaveLength(1);

		const noTitle = EXAMPLE_PLAN.replace("title: Billing migration to Stripe\n", "");
		expect(findingsFor(noTitle, "frontmatter-title")).toHaveLength(1);

		const noKind = EXAMPLE_PLAN.replace("kind: plan\n", "");
		expect(findingsFor(noKind, "frontmatter-kind")).toHaveLength(1);
	});

	it("rejects unknown kinds and authored frontmatter fields", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace("kind: plan", "kind: course"), "frontmatter-kind")).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_PLAN.replace("kind: plan\n", "kind: plan\ntheme: arcade\n"), "frontmatter-vocabulary"),
		).toHaveLength(1);
	});

	it("accepts canonical read-only pull-back metadata", () => {
		const source = EXAMPLE_PLAN.replace(
			"kind: plan\n",
			'kind: plan\nversion: 2\nstatus: "draft"\nurl: "https://plans.example/p/demo/plan"\nopenDecisions: 1\nupdatedAt: "2026-08-23T00:00:00.000Z"\n',
		);
		expect(findingsFor(source, "frontmatter-vocabulary")).toEqual([]);
	});

	it.each(["Decision", "Phase", "Diagram"])("requires %s for plan profiles", (component) => {
		const source = EXAMPLE_PLAN.replace(new RegExp(`<${component}[^>]*>[\\s\\S]*?</${component}>`, "g"), "");
		expect(findingsFor(source, "required-components").some((finding) => finding.message.includes(component))).toBe(
			true,
		);
	});

	it("does not require planning blocks in a lesson", () => {
		expect(findingsFor(EXAMPLE_LESSON, "required-components")).toEqual([]);
	});

	it("requires audience, outcomes, retrieval, transfer, and Recap for learning profiles", () => {
		expect(
			findingsFor(
				EXAMPLE_LESSON.replace(
					"audience: Engineers who know request handlers but have not designed replay-safe writes\n",
					"",
				),
				"profile-audience",
			),
		).toHaveLength(1);
		expect(findingsFor(EXAMPLE_LESSON.replace(/outcomes:\n(?: {2}- .+\n)+/, ""), "profile-outcomes")).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_LESSON.replace(/<Check[^>]*kind="predict"[\s\S]*?<\/Check>\n\n/, ""), "required-checks"),
		).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_LESSON.replace(/<Check[^>]*kind="apply"[\s\S]*?<\/Check>\n\n/, ""), "required-checks"),
		).toHaveLength(1);
		expect(findingsFor(EXAMPLE_LESSON.replace("## Recap", "## Summary"), "learning-recap")).toHaveLength(1);
	});

	it("warns when an outcome is not observable", () => {
		const source = EXAMPLE_LESSON.replace("Explain why duplicate delivery is normal", "Understand webhook retries");
		expect(findingsFor(source, "observable-outcomes")).toHaveLength(1);
	});

	it("suggests guided-plan when a plan declares outcomes and Checks", () => {
		const source = EXAMPLE_GUIDED_PLAN.replace("kind: guided-plan", "kind: plan");
		expect(findingsFor(source, "guided-plan-profile")).toHaveLength(1);
	});
});

describe("document structure", () => {
	it("requires exactly one TLDR in the first content position", () => {
		const missing = EXAMPLE_PLAN.replace('<TLDR id="summary">', '<Callout id="summary" kind="note">').replace(
			"</TLDR>",
			"</Callout>",
		);
		expect(findingsFor(missing, "tldr-position")[0]?.message).toContain("exactly one");

		const moved = EXAMPLE_PLAN.replace('<TLDR id="summary">', 'Intro.\n\n<TLDR id="summary">');
		expect(findingsFor(moved, "tldr-position")[0]?.message).toContain("first block");
	});

	it("limits TLDR, section summaries, paragraphs, and heading depth", () => {
		const longTldr = EXAMPLE_PLAN.replace(
			"Move subscription billing from the homegrown ledger to Stripe, keeping the ledger as read-only history.",
			Array.from({ length: 61 }, () => "word").join(" "),
		);
		expect(findingsFor(longTldr, "tldr-length")).toHaveLength(1);

		const wrappedSummary = EXAMPLE_PLAN.replace(
			"The current ledger has costly proration errors and no clear owner.",
			"The current ledger has costly errors\nand no clear owner.",
		);
		expect(findingsFor(wrappedSummary, "section-summary")).toHaveLength(1);

		expect(findingsFor(`${EXAMPLE_PLAN}\nOne. Two. Three. Four. Five. Six.\n`, "paragraph-length")).toHaveLength(1);
		expect(findingsFor(`${EXAMPLE_PLAN}\n#### Too deep\n`, "heading-depth")).toHaveLength(1);
	});

	it("requires component children on their own lines", () => {
		const source = EXAMPLE_PLAN.replace(
			'<Decision owner="@srujan" id="historical-invoices">\nDo we backfill historical invoices into Stripe, or leave them in the read-only ledger?\n</Decision>',
			'<Decision owner="@srujan" id="historical-invoices">Do we backfill historical invoices?</Decision>',
		);
		expect(findingsFor(source, "block-children-lines")).toHaveLength(1);
	});

	it("rejects unknown components, raw HTML, and executable MDX", () => {
		expect(findingsFor(`${EXAMPLE_PLAN}\n<Accordion>\nNo.\n</Accordion>\n`, "component-vocabulary")).toHaveLength(1);
		expect(findingsFor(`${EXAMPLE_PLAN}\n<div>Unsupported</div>\n`, "component-vocabulary").length).toBeGreaterThan(0);
		expect(findingsFor(`${EXAMPLE_PLAN}\n{dangerous()}\n`, "component-vocabulary").length).toBeGreaterThan(0);
	});
});

describe("component contracts", () => {
	it("rejects unknown props and expression values", () => {
		const unknown = EXAMPLE_PLAN.replace('<TLDR id="summary">', '<TLDR id="summary" tone="fun">');
		expect(findingsFor(unknown, "component-props")).toHaveLength(1);

		const expression = EXAMPLE_PLAN.replace('owner="@srujan"', "owner={dynamicOwner}");
		expect(findingsFor(expression, "component-props").length).toBeGreaterThan(0);
	});

	it("requires Decision, Option, Rejected, Phase, and Check props", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace(' owner="@srujan"', ""), "decision-owner")).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_PLAN.replace(' name="Backfill everything"', ""), "component-props").length,
		).toBeGreaterThan(0);
		expect(findingsFor(EXAMPLE_PLAN.replace(' what="Chargebee"', ""), "component-props").length).toBeGreaterThan(0);
		expect(findingsFor(EXAMPLE_PLAN.replace(' n="1"', ""), "component-props").length).toBeGreaterThan(0);
		expect(findingsFor(EXAMPLE_LESSON.replace(' id="predict-replay"', ""), "component-props").length).toBeGreaterThan(
			0,
		);
	});

	it("requires exactly one recommended Tradeoff option", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace(" recommended", ""), "tradeoff-options")).toHaveLength(1);
		expect(
			findingsFor(
				EXAMPLE_PLAN.replace('<Option name="Backfill everything">', '<Option name="Backfill everything" recommended>'),
				"tradeoff-options",
			),
		).toHaveLength(1);
	});

	it("requires Phase Gate and Rollback", () => {
		expect(
			findingsFor(
				EXAMPLE_PLAN.replace(
					"**Gate:** The named billing contract tests pass for success, retry, and failure.\n\n",
					"",
				),
				"phase-gate-rollback",
			),
		).toHaveLength(1);
		expect(
			findingsFor(
				EXAMPLE_PLAN.replace("**Rollback:** Route checkout to the ledger before accepting new subscriptions.\n", ""),
				"phase-gate-rollback",
			),
		).toHaveLength(1);
	});

	it("requires diagram and code fence languages to match", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace("```mermaid", "```d2"), "fence-language").length).toBeGreaterThan(0);
		expect(findingsFor(EXAMPLE_LESSON.replace("```ts", "```js"), "fence-language")).toHaveLength(1);
	});

	it("requires valid Risk and Callout enums", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace('severity="high"', 'severity="critical"'), "risk-severity")).toHaveLength(
			1,
		);
		const callout = `${EXAMPLE_PLAN}\n<Callout id="tip" kind="tip">\nNo.\n</Callout>\n`;
		expect(findingsFor(callout, "component-vocabulary")).toHaveLength(1);
	});

	it("rejects nested root blocks and misplaced Options", () => {
		const nestedDecision = EXAMPLE_PLAN.replace(
			'<Option name="Backfill everything">\nOne source of truth. Two weeks of work and risky legacy-plan mapping.\n</Option>',
			'<Option name="Backfill everything">\n<Decision id="nested" owner="@nested">\nNested?\n</Decision>\n</Option>',
		);
		const decisionAnalysis = analyzePlan(nestedDecision);
		expect(findingsFor(nestedDecision, "component-placement")).toHaveLength(1);
		expect(decisionAnalysis.canPersist).toBe(false);

		const misplacedOption = EXAMPLE_PLAN.replace(
			'<Option name="Backfill everything">\nOne source of truth. Two weeks of work and risky legacy-plan mapping.\n</Option>',
			'<Callout id="wrapper" kind="note">\n<Option name="Backfill everything">\nNo.\n</Option>\n</Callout>',
		);
		expect(findingsFor(misplacedOption, "component-placement").length).toBeGreaterThan(0);
		expect(analyzePlan(misplacedOption).canPersist).toBe(false);
	});
});

describe("Check", () => {
	it("requires a supported kind and prompt of at most forty words", () => {
		expect(findingsFor(EXAMPLE_LESSON.replace('kind="predict"', 'kind="choose"'), "check-kind")).toHaveLength(1);
		const prompt = Array.from({ length: 41 }, () => "word").join(" ");
		const source = EXAMPLE_LESSON.replace(
			'prompt="What can happen if the key commits before the business effect?"',
			`prompt="${prompt}"`,
		);
		expect(findingsFor(source, "check-prompt")).toHaveLength(1);
	});

	it("requires Answer then Why with optional Next last", () => {
		const missingWhy = EXAMPLE_LESSON.replace(
			"\n**Why:** The retry sees the key and skips work that never finished.",
			"",
		);
		expect(findingsFor(missingWhy, "check-feedback")).toHaveLength(1);

		const wrongOrder = EXAMPLE_LESSON.replace(
			"**Answer:** A crash can leave a committed key without the effect.\n\n**Why:** The retry sees the key and skips work that never finished.",
			"**Why:** The retry sees the key and skips work that never finished.\n\n**Answer:** A crash can leave a committed key without the effect.",
		);
		expect(findingsFor(wrongOrder, "check-feedback")).toHaveLength(1);
	});

	it("requires for to resolve to another root component id", () => {
		expect(
			findingsFor(EXAMPLE_LESSON.replace('for="transaction-shape"', 'for="missing"'), "check-target"),
		).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_LESSON.replace('for="transaction-shape"', 'for="apply-transaction"'), "check-target"),
		).toHaveLength(1);
	});
});

describe("persistence safety", () => {
	it.each([
		["frontmatter", EXAMPLE_PLAN.replace("kind: plan\n", ""), "frontmatter-kind"],
		["unknown component", `${EXAMPLE_PLAN}\n<Unknown>\nNo.\n</Unknown>\n`, "component-vocabulary"],
		["raw HTML", `${EXAMPLE_PLAN}\n<div>Unsafe</div>\n`, "component-vocabulary"],
		["unknown prop", EXAMPLE_PLAN.replace('<TLDR id="summary">', '<TLDR id="summary" tone="fun">'), "component-props"],
		["invalid risk", EXAMPLE_PLAN.replace('severity="high"', 'severity="critical"'), "risk-severity"],
		["mismatched fence", EXAMPLE_PLAN.replace("```mermaid", "```d2"), "fence-language"],
		["tradeoff shape", EXAMPLE_PLAN.replace(" recommended", ""), "tradeoff-options"],
		[
			"phase grammar",
			EXAMPLE_PLAN.replace("**Gate:** The named billing contract tests pass for success, retry, and failure.\n\n", ""),
			"phase-gate-rollback",
		],
		["Check kind", EXAMPLE_LESSON.replace('kind="predict"', 'kind="choose"'), "check-kind"],
		["Check target", EXAMPLE_LESSON.replace('for="transaction-shape"', 'for="missing"'), "check-target"],
	])("does not persist %s even when force is requested later", (_case, source, rule) => {
		const analysis = analyzePlan(source);
		expect(analysis.report.findings.some((finding) => finding.rule === rule)).toBe(true);
		expect(analysis.canPersist).toBe(false);
	});

	it("keeps content-quality errors forceable when rendering remains safe", () => {
		const source = EXAMPLE_PLAN.replace(/<Diagram[\s\S]*?<\/Diagram>\n\n/g, "");
		const analysis = analyzePlan(source);
		expect(analysis.report.findings.some((finding) => finding.rule === "required-components")).toBe(true);
		expect(analysis.canPersist).toBe(true);
	});
});

describe("identity and warnings", () => {
	it.each(["Plan_1", "plan-1", "A"])("accepts explicit id %s", (id) => {
		expect(findingsFor(EXAMPLE_PLAN.replace('id="historical-invoices"', `id="${id}"`), "component-id")).toEqual([]);
	});

	it.each(['id="1-starts-with-a-digit"', 'id="contains a space"', 'id=""', "id={dynamicId}"])(
		"rejects malformed explicit %s",
		(attribute) => {
			const analysis = analyzePlan(EXAMPLE_PLAN.replace('id="historical-invoices"', attribute));
			expect(analysis.report.findings.some((finding) => finding.rule === "component-id")).toBe(true);
			expect(analysis.canPersist).toBe(false);
		},
	);

	it("rejects duplicate explicit ids", () => {
		const source = EXAMPLE_PLAN.replace('id="risk-webhook-replay"', 'id="historical-invoices"');
		expect(findingsFor(source, "component-id")).toHaveLength(2);
		expect(analyzePlan(source).canPersist).toBe(false);
	});

	it("warns for missing emoji, Rejected, second Diagram, and long reading time", () => {
		expect(findingsFor(EXAMPLE_PLAN.replace("emoji: 🧾\n", ""), "plan-emoji")).toHaveLength(1);
		expect(
			findingsFor(EXAMPLE_PLAN.replace(/<Rejected[\s\S]*?<\/Rejected>\n\n/, ""), "rejected-alternative"),
		).toHaveLength(1);
		expect(findingsFor(EXAMPLE_PLAN.replace(/<Diagram[\s\S]*?<\/Diagram>\n\n/, ""), "diagram-count")).toHaveLength(1);

		const paragraph = Array.from({ length: 100 }, () => "word").join(" ");
		const longSource = `${EXAMPLE_PLAN}\n${Array.from({ length: 25 }, () => paragraph).join("\n\n")}\n`;
		expect(findingsFor(longSource, "read-time")).toHaveLength(1);
	});

	it("calculates score from errors and warnings", () => {
		const source = EXAMPLE_PLAN.replace(' owner="@srujan"', "").replace(/<Rejected[\s\S]*?<\/Rejected>\n\n/, "");
		expect(lint(source)).toMatchObject({ errors: 2, warnings: 1, score: 77, canPublish: false });
	});
});
