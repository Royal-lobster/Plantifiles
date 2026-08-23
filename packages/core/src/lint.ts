import type { Node } from "unist";
import { parseArtifactMetadata } from "./metadata.js";
import { isValidExplicitId, normalizeParsedSource } from "./normalize.js";
import {
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
	type ArtifactMetadata,
	type Block,
	COMPONENT_NAMES,
	type ComponentName,
	type LintFinding,
	type LintReport,
	type LintSeverity,
	type PlanAnalysis,
} from "./types.js";

const VALID_RISK_SEVERITIES: Record<string, true> = { low: true, med: true, high: true };
const VALID_DIAGRAM_LANGUAGES: Record<string, true> = { mermaid: true, d2: true };
const VALID_CALLOUT_KINDS: Record<string, true> = { note: true, warning: true };
const VALID_CHECK_KINDS: Record<string, true> = { predict: true, recall: true, apply: true, reflect: true };
const RETRIEVAL_CHECK_KINDS: Record<string, true> = { predict: true, recall: true };
const TRANSFER_CHECK_KINDS: Record<string, true> = { apply: true, reflect: true };
const NON_PERSISTABLE_RULES: Record<string, true> = {
	"component-id": true,
	"component-placement": true,
	"component-vocabulary": true,
	"component-props": true,
	"block-children-lines": true,
	"fence-language": true,
	"tradeoff-options": true,
	"risk-severity": true,
	"phase-gate-rollback": true,
	"check-kind": true,
	"check-prompt": true,
	"check-feedback": true,
	"check-target": true,
};

const ALLOWED_ATTRIBUTES: Record<ComponentName, readonly string[]> = {
	TLDR: ["id"],
	Decision: ["id", "owner"],
	Tradeoff: ["id"],
	Option: ["name", "recommended"],
	Rejected: ["id", "what"],
	Phase: ["id", "n", "title"],
	Risk: ["id", "severity"],
	Diagram: ["id", "lang"],
	CodeSketch: ["id", "lang", "file"],
	Callout: ["id", "kind"],
	Check: ["id", "kind", "prompt", "for"],
};

type ComponentAttribute = {
	name: string;
	value: unknown;
};

type NodeEntry = {
	node: Node;
	parent?: Node;
};

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

function descendants(node: Node): NodeEntry[] {
	const found: NodeEntry[] = [];
	for (const child of childNodes(node)) {
		found.push({ node: child, parent: node }, ...descendants(child));
	}
	return found;
}

function componentAttributes(node: Node): ComponentAttribute[] {
	if (!("attributes" in node) || !Array.isArray(node.attributes)) return [];
	return node.attributes.flatMap((attribute): ComponentAttribute[] => {
		if (
			attribute !== null &&
			typeof attribute === "object" &&
			"name" in attribute &&
			typeof attribute.name === "string"
		) {
			return [{ name: attribute.name, value: "value" in attribute ? attribute.value : undefined }];
		}
		return [];
	});
}

function attributeValue(node: Node, name: string): { value: unknown } | undefined {
	const attribute = componentAttributes(node).find((item) => item.name === name);
	return attribute ? { value: attribute.value } : undefined;
}

function blockAtLine(blocks: Block[], line: number): string | undefined {
	let match: Block | undefined;
	for (const block of blocks) {
		if (block.line > line) break;
		match = block;
	}
	return match?.key;
}

function paragraphLabel(node: Node): string | undefined {
	if (node.type !== "paragraph") return undefined;
	const [first] = childNodes(node);
	return first?.type === "strong" ? nodeText(first).trim() : undefined;
}

function codeLanguage(node: Node): string | undefined {
	if (node.type !== "code" || !("lang" in node)) return undefined;
	return typeof node.lang === "string" ? node.lang : undefined;
}

export function analyzePlan(source: string, options: { emoji?: string | undefined } = {}): PlanAnalysis {
	let parsed: ParsedSource;
	const emptyMetadata: ArtifactMetadata = { profile: null, outcomes: [] };
	try {
		parsed = parseSource(source);
	} catch (error) {
		const message = error instanceof Error ? error.message : "The document could not be parsed.";
		return {
			canPersist: false,
			blocks: [],
			metadata: emptyMetadata,
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
	const metadataResult = parseArtifactMetadata(parsed.source);
	const metadata = metadataResult.metadata;
	const findings: LintFinding[] = metadataResult.issues.map((issue) => ({
		...issue,
		severity: "error",
	}));
	const add = (rule: string, severity: LintSeverity, message: string, node?: Node): void => {
		const line = node ? lineOf(node) : 1;
		const blockKey = blockAtLine(blocks, line);
		findings.push({ rule, severity, message, line, ...(blockKey ? { blockKey } : {}) });
	};

	const nodeEntries = content.flatMap((node): NodeEntry[] => [{ node }, ...descendants(node)]);
	const allNodes = nodeEntries.map(({ node }) => node);
	const components = allNodes.filter((node) => componentName(node) !== undefined);
	const topLevelComponents = content.filter((node) => componentName(node) !== undefined);
	const tldrs = components.filter((node) => componentName(node) === "TLDR");
	const checks = components.filter((node) => componentName(node) === "Check");

	for (const { node, parent } of nodeEntries) {
		const name = componentName(node);
		if (!name || !COMPONENT_NAMES.includes(name as ComponentName)) continue;
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

	for (const node of components) {
		const name = componentName(node);
		if (!name || !COMPONENT_NAMES.includes(name as ComponentName)) continue;
		const allowed = ALLOWED_ATTRIBUTES[name as ComponentName];
		for (const attribute of componentAttributes(node)) {
			if (!allowed.includes(attribute.name)) {
				add("component-props", "error", `<${name}> does not allow a ${attribute.name} prop.`, node);
				continue;
			}
			if (name === "Option" && attribute.name === "recommended") {
				if (attribute.value !== null) {
					add("component-props", "error", "<Option> recommended must be a bare boolean prop.", node);
				}
				continue;
			}
			if (typeof attribute.value !== "string") {
				add("component-props", "error", `<${name}> ${attribute.name} must be a string literal.`, node);
			}
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

	const learningProfile = metadata.profile === "lesson" || metadata.profile === "guided-plan";
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
		} else if (learningProfile && wordCount > 60) {
			add(
				"learning-paragraph-length",
				"warning",
				`Learning paragraph has ${wordCount} words; target 60 or fewer.`,
				node,
			);
		}
	}

	if (metadata.profile === "plan" || metadata.profile === "guided-plan") {
		for (const required of ["Decision", "Phase", "Diagram"]) {
			if (!components.some((node) => componentName(node) === required)) {
				add("required-components", "error", `Add at least one <${required}> component.`);
			}
		}
	}

	for (const node of components.filter((item) => componentName(item) === "Decision")) {
		if (!stringAttribute(node, "owner")) add("decision-owner", "error", "Every <Decision> requires an owner.", node);
	}

	for (const tradeoff of components.filter((item) => componentName(item) === "Tradeoff")) {
		const options = childNodes(tradeoff).filter((node) => componentName(node) === "Option");
		const recommended = options.filter((node) => attributeValue(node, "recommended")?.value === null);
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
		if (!VALID_RISK_SEVERITIES[stringAttribute(risk, "severity") ?? ""]) {
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
		if (name && !COMPONENT_NAMES.includes(name as ComponentName)) {
			add("component-vocabulary", "error", `<${name}> is not in the Plantifiles component vocabulary.`, node);
		}
		if (["html", "mdxjsEsm", "mdxFlowExpression", "mdxTextExpression"].includes(node.type)) {
			add("component-vocabulary", "error", "Raw HTML and executable MDX are not allowed.", node);
		}
	}

	for (const node of components) {
		if (node.type === "mdxJsxTextElement") {
			add("block-children-lines", "error", `<${componentName(node)}> must put its children on their own lines.`, node);
		}
	}

	for (const node of components) {
		const name = componentName(node);
		const requiredAttributes: Record<string, readonly string[]> = {
			Decision: ["owner"],
			Option: ["name"],
			Rejected: ["what"],
			Phase: ["n", "title"],
			Risk: ["severity"],
			Diagram: ["lang"],
			CodeSketch: ["lang"],
			Callout: ["kind"],
			Check: ["id", "kind", "prompt"],
		};
		for (const required of requiredAttributes[name ?? ""] ?? []) {
			if (!stringAttribute(node, required)) {
				add("component-props", "error", `<${name}> requires a nonempty ${required} string prop.`, node);
			}
		}

		if (name === "Diagram") {
			const language = stringAttribute(node, "lang") ?? "";
			const codeChildren = childNodes(node).filter((child) => child.type === "code");
			if (!VALID_DIAGRAM_LANGUAGES[language] || codeChildren.length !== 1) {
				add(
					"component-vocabulary",
					"error",
					'<Diagram> requires lang="mermaid" or lang="d2" and exactly one fenced code block.',
					node,
				);
			} else if (codeLanguage(codeChildren[0] as Node) !== language) {
				add("fence-language", "error", `<Diagram> lang must match its fenced code language "${language}".`, node);
			}
		}

		if (name === "CodeSketch") {
			const language = stringAttribute(node, "lang") ?? "";
			const codeChildren = childNodes(node).filter((child) => child.type === "code");
			if (codeChildren.length !== 1) {
				add("component-vocabulary", "error", "<CodeSketch> requires exactly one fenced code block.", node);
			} else if (codeLanguage(codeChildren[0] as Node) !== language) {
				add("fence-language", "error", `<CodeSketch> lang must match its fenced code language "${language}".`, node);
			}
		}

		if (name === "Callout" && !VALID_CALLOUT_KINDS[stringAttribute(node, "kind") ?? ""]) {
			add("component-vocabulary", "error", '<Callout> kind must be "note" or "warning".', node);
		}

		if (name === "Phase" && (metadata.profile === "plan" || metadata.profile === "guided-plan")) {
			const labels = childNodes(node).map(paragraphLabel);
			if (!labels.includes("Gate:") || !labels.includes("Rollback:")) {
				add("phase-gate-rollback", "error", "<Phase> requires **Gate:** and **Rollback:** paragraphs.", node);
			}
		}

		if (name === "Check") {
			const kind = stringAttribute(node, "kind") ?? "";
			const prompt = stringAttribute(node, "prompt") ?? "";
			if (!VALID_CHECK_KINDS[kind]) {
				add("check-kind", "error", '<Check> kind must be "predict", "recall", "apply", or "reflect".', node);
			}
			const promptWords = words(prompt).length;
			if (promptWords > 40) {
				add("check-prompt", "error", `<Check> prompt has ${promptWords} words; the maximum is 40.`, node);
			}
			const labels = childNodes(node).map(paragraphLabel);
			const answerIndex = labels.indexOf("Answer:");
			const whyIndex = labels.indexOf("Why:");
			const nextIndex = labels.indexOf("Next:");
			if (answerIndex < 0 || whyIndex < 0 || whyIndex < answerIndex || (nextIndex >= 0 && nextIndex < whyIndex)) {
				add(
					"check-feedback",
					"error",
					"<Check> requires **Answer:** then **Why:**, with optional **Next:** last.",
					node,
				);
			}
		}
	}

	const topLevelComponentById = new Map<string, Node>();
	for (const node of topLevelComponents) {
		const id = stringAttribute(node, "id");
		if (id && isValidExplicitId(id)) topLevelComponentById.set(id, node);
	}
	for (const check of checks) {
		const targetAttribute = attributeValue(check, "for");
		if (!targetAttribute) continue;
		const target = stringAttribute(check, "for");
		const ownId = stringAttribute(check, "id");
		if (!target || target === ownId || !topLevelComponentById.has(target)) {
			add("check-target", "error", "<Check> for must name another top-level component's explicit id.", check);
		}
	}

	if (learningProfile) {
		if (!metadata.audience) {
			add("profile-audience", "error", `${metadata.profile} requires a one-line audience field.`);
		}
		if (metadata.outcomes.length === 0) {
			add("profile-outcomes", "error", `${metadata.profile} requires one to five outcomes.`);
		}
		for (const outcome of metadata.outcomes) {
			if (/^(understand|learn)\b/i.test(outcome)) {
				add(
					"observable-outcomes",
					"warning",
					`Outcome "${outcome}" should name something the reader can explain, predict, compare, trace, review, or do.`,
				);
			}
		}
		const checkKinds = checks.map((check) => stringAttribute(check, "kind") ?? "");
		if (!checkKinds.some((kind) => RETRIEVAL_CHECK_KINDS[kind])) {
			add("required-checks", "error", `${metadata.profile} requires one predict or recall Check.`);
		}
		if (!checkKinds.some((kind) => TRANSFER_CHECK_KINDS[kind])) {
			add("required-checks", "error", `${metadata.profile} requires one apply or reflect Check.`);
		}
		const levelTwoHeadings = content.filter((node) => node.type === "heading" && node.depth === 2);
		const lastHeading = levelTwoHeadings.at(-1);
		if (!lastHeading || nodeText(lastHeading).trim().toLowerCase() !== "recap") {
			add("learning-recap", "error", `${metadata.profile} must end with a level-two Recap section.`, lastHeading);
		}
	}

	if (metadata.profile === "plan" && checks.length > 0 && metadata.outcomes.length > 0) {
		add("guided-plan-profile", "warning", 'A plan with outcomes and Checks should use kind: "guided-plan".', checks[0]);
	}

	if (!(options.emoji ?? metadata.emoji)) {
		add("plan-emoji", "warning", "Choose one emoji that represents the document and add it to frontmatter.");
	}

	if (
		(metadata.profile === "plan" || metadata.profile === "guided-plan") &&
		!components.some((node) => componentName(node) === "Rejected")
	) {
		add("rejected-alternative", "warning", "Record at least one rejected alternative and why it was rejected.");
	}

	if (metadata.profile === "plan" || metadata.profile === "guided-plan") {
		const diagramCount = components.filter((node) => componentName(node) === "Diagram").length;
		if (diagramCount < 2) {
			add(
				"diagram-count",
				"warning",
				`Document has ${diagramCount} diagram${diagramCount === 1 ? "" : "s"}; use at least two with different jobs.`,
			);
		}
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
		(finding) => finding.rule.startsWith("frontmatter-") || NON_PERSISTABLE_RULES[finding.rule],
	);
	return { blocks, metadata, canPersist, report, tree: parsed.tree };
}

export function lint(source: string, options: { emoji?: string | undefined } = {}): LintReport {
	return analyzePlan(source, options).report;
}
