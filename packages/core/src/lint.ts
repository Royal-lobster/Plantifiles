import type { Node } from "unist";
import { planEmojiFromSource } from "./emoji.js";
import { isValidExplicitId, normalizeParsedSource } from "./normalize.js";
import {
	booleanAttribute,
	componentName,
	lineOf,
	nodeSource,
	nodeText,
	type ParsedSource,
	parseSource,
	rootContent,
	stringAttribute,
} from "./syntax.js";
import {
	type Block,
	COMPONENT_NAMES,
	type LintFinding,
	type LintReport,
	type LintSeverity,
	type PlanAnalysis,
} from "./types.js";

const COMPONENT_SET = new Set<string>(COMPONENT_NAMES);
const VALID_RISK_SEVERITIES = new Set(["low", "med", "high"]);
const VALID_DIAGRAM_LANGUAGES = new Set(["mermaid", "d2"]);
const VALID_CALLOUT_KINDS = new Set(["note", "warning"]);

function words(value: string): string[] {
	return value.trim() ? value.trim().split(/\s+/) : [];
}

function sentenceCount(value: string): number {
	return value
		.trim()
		.split(/(?<=[.!?])(?:\s+|$)/)
		.filter(Boolean).length;
}

function childNodes(node: Node): Node[] {
	if (!("children" in node) || !Array.isArray(node.children)) return [];
	return node.children.filter((child): child is Node => Boolean(child) && typeof child === "object" && "type" in child);
}

type NodeEntry = {
	node: Node;
	parent?: Node;
};

function descendants(node: Node): NodeEntry[] {
	const found: NodeEntry[] = [];
	for (const child of childNodes(node)) {
		found.push({ node: child, parent: node }, ...descendants(child));
	}
	return found;
}

function attributeValue(node: Node, name: string): { value: unknown } | undefined {
	if (!("attributes" in node) || !Array.isArray(node.attributes)) return undefined;
	for (const attribute of node.attributes) {
		if (attribute !== null && typeof attribute === "object" && "name" in attribute && attribute.name === name) {
			return { value: "value" in attribute ? attribute.value : undefined };
		}
	}
	return undefined;
}

function blockAtLine(blocks: Block[], line: number): string | undefined {
	let match: Block | undefined;
	for (const block of blocks) {
		if (block.line > line) break;
		match = block;
	}
	return match?.key;
}

export function analyzePlan(source: string, options: { emoji?: string | undefined } = {}): PlanAnalysis {
	let parsed: ParsedSource;
	try {
		parsed = parseSource(source);
	} catch (error) {
		const message = error instanceof Error ? error.message : "The document could not be parsed.";
		return {
			canPersist: false,
			blocks: [],
			report: {
				errors: 1,
				warnings: 0,
				score: 90,
				readTimeMinutes: 0,
				canPublish: false,
				findings: [{ rule: "valid-mdx", severity: "error", message, line: 1 }],
			},
		};
	}

	const content = rootContent(parsed.tree);
	const blocks = normalizeParsedSource(parsed);
	const findings: LintFinding[] = [];
	const add = (rule: string, severity: LintSeverity, message: string, node?: Node): void => {
		const line = node ? lineOf(node) : 1;
		const blockKey = blockAtLine(blocks, line);
		findings.push({ rule, severity, message, line, ...(blockKey ? { blockKey } : {}) });
	};

	const nodeEntries = content.flatMap((node): NodeEntry[] => [{ node }, ...descendants(node)]);
	const allNodes = nodeEntries.map(({ node }) => node);
	const components = allNodes.filter((node) => componentName(node) !== undefined);
	const tldrs = components.filter((node) => componentName(node) === "TLDR");

	for (const { node, parent } of nodeEntries) {
		const name = componentName(node);
		if (!name || !COMPONENT_SET.has(name)) continue;
		const parentName = parent ? componentName(parent) : undefined;
		const validPlacement = name === "Option" ? parentName === "Tradeoff" : parent === undefined;
		if (!validPlacement) {
			add(
				"component-placement",
				"error",
				name === "Option" ? "<Option> must be a direct child of <Tradeoff>." : `<${name}> must be a top-level block.`,
				node,
			);
		}
	}

	const nodesByExplicitId = new Map<string, Node[]>();
	for (const node of components) {
		const attribute = attributeValue(node, "id");
		if (!attribute) continue;
		if (typeof attribute.value !== "string" || !isValidExplicitId(attribute.value)) {
			add(
				"component-id",
				"error",
				'Explicit id values must start with an ASCII letter and contain only letters, digits, "-" or "_".',
				node,
			);
			continue;
		}
		const matchingNodes = nodesByExplicitId.get(attribute.value) ?? [];
		matchingNodes.push(node);
		nodesByExplicitId.set(attribute.value, matchingNodes);
	}
	for (const [id, nodes] of nodesByExplicitId) {
		if (nodes.length < 2) continue;
		for (const node of nodes) {
			add("component-id", "error", `Explicit id "${id}" is duplicated; IDs must be unique.`, node);
		}
	}

	if (tldrs.length !== 1) {
		add("tldr-position", "error", `Expected exactly one <TLDR>; found ${tldrs.length}.`, tldrs[0]);
	} else if (!content[0] || componentName(content[0]) !== "TLDR") {
		add("tldr-position", "error", "<TLDR> must be the first block after frontmatter.", tldrs[0]);
	}

	for (const tldr of tldrs) {
		const count = words(nodeText(tldr)).length;
		if (count > 60) add("tldr-length", "error", `<TLDR> has ${count} words; the maximum is 60.`, tldr);
	}

	content.forEach((node, index) => {
		if (node.type !== "heading" || node.depth !== 2) return;
		const firstChild = content[index + 1];
		const valid =
			firstChild?.type === "paragraph" &&
			words(nodeText(firstChild)).length <= 30 &&
			nodeSource(parsed.source, firstChild).split("\n").length === 1;
		if (!valid) {
			add(
				"section-summary",
				"error",
				"Every level-two section must open with a one-line summary paragraph of at most 30 words.",
				node,
			);
		}
	});

	for (const node of allNodes) {
		if (node.type !== "paragraph") continue;
		const text = nodeText(node);
		const wordCount = words(text).length;
		const sentences = sentenceCount(text);
		if (wordCount > 120 || sentences > 5) {
			add(
				"paragraph-length",
				"error",
				`Paragraph has ${wordCount} words and ${sentences} sentences; maximums are 120 words and 5 sentences.`,
				node,
			);
		}
	}

	for (const required of ["Decision", "Phase", "Diagram"]) {
		if (!components.some((node) => componentName(node) === required)) {
			add("required-components", "error", `Add at least one <${required}> component.`);
		}
	}

	for (const node of components.filter((item) => componentName(item) === "Decision")) {
		if (!stringAttribute(node, "owner")) add("decision-owner", "error", "Every <Decision> requires an owner.", node);
	}

	for (const tradeoff of components.filter((item) => componentName(item) === "Tradeoff")) {
		const options = childNodes(tradeoff).filter((node) => componentName(node) === "Option");
		const recommended = options.filter((node) => booleanAttribute(node, "recommended"));
		if (options.length < 2 || recommended.length !== 1) {
			add(
				"tradeoff-options",
				"error",
				`<Tradeoff> requires at least two <Option> children and exactly one recommended option; found ${options.length} options and ${recommended.length} recommended.`,
				tradeoff,
			);
		}
	}

	for (const risk of components.filter((item) => componentName(item) === "Risk")) {
		if (!VALID_RISK_SEVERITIES.has(stringAttribute(risk, "severity") ?? "")) {
			add("risk-severity", "error", '<Risk> severity must be "low", "med", or "high".', risk);
		}
	}

	for (const node of allNodes) {
		if (node.type === "heading" && "depth" in node && typeof node.depth === "number" && node.depth > 3) {
			add("heading-depth", "error", "Heading depth may not exceed level three.", node);
		}
	}

	for (const node of allNodes) {
		const name = componentName(node);
		if (name && !COMPONENT_SET.has(name)) {
			add("component-vocabulary", "error", `<${name}> is not in the Plantifiles component vocabulary.`, node);
		}
		if (["html", "mdxjsEsm", "mdxFlowExpression", "mdxTextExpression"].includes(node.type)) {
			add("component-vocabulary", "error", "Raw HTML and executable MDX are not allowed.", node);
		}
	}

	for (const node of components) {
		if (node.type === "mdxJsxTextElement") {
			const name = componentName(node);
			add("block-children-lines", "error", `<${name}> must put its children on their own lines.`, node);
		}
	}

	for (const node of components) {
		const name = componentName(node);
		const requiredAttribute =
			name === "Option"
				? "name"
				: name === "Rejected"
					? "what"
					: name === "Phase"
						? "n"
						: name === "CodeSketch"
							? "lang"
							: undefined;
		if (requiredAttribute && !stringAttribute(node, requiredAttribute)) {
			add("component-vocabulary", "error", `<${name}> requires a ${requiredAttribute} prop.`, node);
		}
		if (name === "Phase" && !stringAttribute(node, "title")) {
			add("component-vocabulary", "error", "<Phase> requires a title prop.", node);
		}
		if (name === "Diagram") {
			const language = stringAttribute(node, "lang") ?? "";
			const codeChildren = childNodes(node).filter((child) => child.type === "code");
			if (!VALID_DIAGRAM_LANGUAGES.has(language) || codeChildren.length !== 1) {
				add(
					"component-vocabulary",
					"error",
					'<Diagram> requires lang="mermaid" or lang="d2" and exactly one fenced code block.',
					node,
				);
			}
		}
		if (name === "CodeSketch" && childNodes(node).filter((child) => child.type === "code").length !== 1) {
			add("component-vocabulary", "error", "<CodeSketch> requires exactly one fenced code block.", node);
		}
		if (name === "Callout" && !VALID_CALLOUT_KINDS.has(stringAttribute(node, "kind") ?? "")) {
			add("component-vocabulary", "error", '<Callout> kind must be "note" or "warning".', node);
		}
	}

	if (!(options.emoji ?? planEmojiFromSource(parsed.source))) {
		add("plan-emoji", "warning", "Choose one emoji that represents the plan and add it to frontmatter.");
	}

	if (!components.some((node) => componentName(node) === "Rejected")) {
		add("rejected-alternative", "warning", "Record at least one rejected alternative and why it was rejected.");
	}

	const diagramCount = components.filter((node) => componentName(node) === "Diagram").length;
	if (diagramCount < 2) {
		add(
			"diagram-count",
			"warning",
			`Plan has ${diagramCount} diagram${diagramCount === 1 ? "" : "s"}; use at least two and vary the diagram type.`,
		);
	}

	const documentWords = words(content.map(nodeText).join(" ")).length;
	const readTimeMinutes = documentWords / 200;
	if (readTimeMinutes > 12) {
		add(
			"read-time",
			"warning",
			`Estimated read time is ${Math.ceil(readTimeMinutes)} minutes; target 12 minutes or less.`,
		);
	}

	const errors = findings.filter((finding) => finding.severity === "error").length;
	const warnings = findings.length - errors;
	const score = Math.max(0, 100 - errors * 10 - warnings * 3);
	const report: LintReport = {
		errors,
		warnings,
		score,
		readTimeMinutes,
		canPublish: errors === 0 && score >= 70,
		findings,
	};
	const canPersist = !findings.some(
		(finding) => finding.rule === "component-id" || finding.rule === "component-placement",
	);
	return { blocks, canPersist, report, tree: parsed.tree };
}

export function lint(source: string, options: { emoji?: string | undefined } = {}): LintReport {
	return analyzePlan(source, options).report;
}
