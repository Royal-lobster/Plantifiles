import { createHash } from "node:crypto";
import type { Heading, RootContent } from "mdast";
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
import type { Block } from "./types.js";

function slug(value: string): string {
	return (
		value
			.normalize("NFKD")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "section"
	);
}

export function isValidExplicitId(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function blockKind(node: RootContent): string {
	const component = componentName(node);
	if (component) return component;
	if (node.type === "heading") return `Heading${node.depth}`;
	return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

function blockTitle(node: RootContent): string | undefined {
	const component = componentName(node);
	if (component === "Phase" || component === "Prototype") return stringAttribute(node, "title");
	if (component === "Option") return stringAttribute(node, "name");
	if (component === "Rejected") return stringAttribute(node, "what");
	if (node.type === "heading") return nodeText(node).trim();
	if (component === "Decision")
		return nodeText(node)
			.trim()
			.split(/[.!?]\s/)[0]
			?.slice(0, 80);
	return undefined;
}

function updateHeadingPath(path: string[], heading: Heading): string[] {
	const next = path.slice(0, heading.depth - 1);
	next[heading.depth - 1] = slug(nodeText(heading));
	return next;
}

export function normalizeParsedSource(parsed: ParsedSource): Block[] {
	const blocks: Block[] = [];
	let headingPath: string[] = [];
	const ordinals = new Map<string, number>();

	for (const node of rootContent(parsed.tree)) {
		const kind = blockKind(node);
		const pathKey = headingPath.join(":") || "root";
		const ordinalKey = `${pathKey}:${kind}`;
		const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1;
		ordinals.set(ordinalKey, ordinal);
		const explicitId = stringAttribute(node, "id");
		const normalizedBlockSource = nodeSource(parsed.source, node);
		const key = explicitId && isValidExplicitId(explicitId) ? explicitId : `${pathKey}:${slug(kind)}:${ordinal}`;
		const title = blockTitle(node);

		blocks.push({
			key,
			kind,
			ordinal: blocks.length,
			contentHash: createHash("sha256").update(normalizedBlockSource).digest("hex"),
			source: normalizedBlockSource,
			...(title ? { title } : {}),
			headingPath: [...headingPath],
			line: lineOf(node),
		});

		if (node.type === "heading") headingPath = updateHeadingPath(headingPath, node);
	}

	return blocks;
}

export function normalize(source: string): Block[] {
	return normalizeParsedSource(parseSource(source));
}
