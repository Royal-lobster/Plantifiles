import type { Root, RootContent } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Node } from "unist";

type MdxAttribute = {
	type: "mdxJsxAttribute";
	name: string;
	value: unknown;
};

type MdxJsxNode = Node & {
	name: string | null;
	attributes: unknown[];
};

export type ParsedSource = {
	source: string;
	tree: Root;
};

function isMdxJsxNode(node: Node): node is MdxJsxNode {
	return (
		(node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
		"name" in node &&
		(typeof node.name === "string" || node.name === null) &&
		"attributes" in node &&
		Array.isArray(node.attributes)
	);
}

function isMdxAttribute(value: unknown): value is MdxAttribute {
	return (
		value !== null &&
		typeof value === "object" &&
		"type" in value &&
		value.type === "mdxJsxAttribute" &&
		"name" in value &&
		typeof value.name === "string" &&
		"value" in value
	);
}

/**
 * `remark-gfm` is not optional here. The renderer parses with it, so without it
 * core and the renderer disagree about Markdown: a table collapses into one
 * enormous paragraph — tripping `paragraph-length` with a diagnostic that blames
 * paragraph length and blocks the publish — and a `- [ ] item` checklist, which
 * the authoring skill tells every agent to write inside `<Phase>`, parses as an
 * unchecked-null list item whose text still contains the literal brackets.
 * One pipeline, one gate.
 */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkMdx);

export function parseSource(source: string): ParsedSource {
	const normalizedSource = source.replace(/\r\n?/g, "\n");
	return { source: normalizedSource, tree: parser.parse(normalizedSource) };
}

export function nodeSource(source: string, node: Node): string {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined) return "";
	return source.slice(start, end).trim();
}

export function nodeText(node: Node): string {
	if ("value" in node && typeof node.value === "string") return node.value;
	if (!("children" in node) || !Array.isArray(node.children)) return "";
	return node.children
		.filter((child): child is Node => Boolean(child) && typeof child === "object" && "type" in child)
		.map(nodeText)
		.join("");
}

export function componentName(node: Node): string | undefined {
	if (!isMdxJsxNode(node)) return undefined;
	return node.name ?? undefined;
}

export function stringAttribute(node: Node, name: string): string | undefined {
	if (!isMdxJsxNode(node)) return undefined;
	const attribute = node.attributes.find((item): item is MdxAttribute => isMdxAttribute(item) && item.name === name);
	return typeof attribute?.value === "string" ? attribute.value : undefined;
}

export function booleanAttribute(node: Node, name: string): boolean {
	if (!isMdxJsxNode(node)) return false;
	const attribute = node.attributes.find((item): item is MdxAttribute => isMdxAttribute(item) && item.name === name);
	return attribute?.value === null || attribute?.value === true;
}

export function rootContent(tree: Root): RootContent[] {
	return tree.children.filter((node) => node.type !== "yaml");
}

export function lineOf(node: Node): number {
	return node.position?.start.line ?? 1;
}
