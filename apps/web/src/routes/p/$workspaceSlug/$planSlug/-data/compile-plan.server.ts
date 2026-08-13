import { analyzePlan, type Block } from "@plantifiles/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import bash from "@shikijs/langs/bash";
import css from "@shikijs/langs/css";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import mermaid from "@shikijs/langs/mermaid";
import sql from "@shikijs/langs/sql";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import type { Element, Root, RootContent } from "hast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighterCore } from "shiki/core";
import { unified } from "unified";

const MDX_NODES = [
	"mdxFlowExpression",
	"mdxJsxFlowElement",
	"mdxJsxTextElement",
	"mdxTextExpression",
	"mdxjsEsm",
] as const;

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;

function getHighlighter() {
	highlighterPromise ??= createHighlighterCore({
		themes: [githubLight, githubDark],
		langs: [typescript, javascript, tsx, jsx, json, bash, css, sql, markdown, mermaid],
		engine: createJavaScriptRegexEngine(),
	});
	return highlighterPromise;
}

type MdxAttribute = { type: "mdxJsxAttribute"; name: string; value: string };
type MdxElement = RootContent & { type: "mdxJsxFlowElement" | "mdxJsxTextElement"; attributes: MdxAttribute[] };

function isMdxElement(node: RootContent): node is MdxElement {
	return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

function blockWrapper(node: RootContent, key: string, kind: string): Element {
	if (isMdxElement(node)) node.attributes.push({ type: "mdxJsxAttribute", name: "blockKey", value: key });
	return {
		type: "element",
		tagName: "div",
		properties: { id: key, "data-block-key": key, "data-block-kind": kind },
		children: [node as Element["children"][number]],
		position: node.position,
	};
}

function annotateBlocks(tree: Root, blocks: Block[]): Root {
	const blocksByLine = new Map(blocks.map((block) => [block.line, block]));
	return {
		...tree,
		children: tree.children.map((node) => {
			const line = node.position?.start.line;
			const block = line === undefined ? undefined : blocksByLine.get(line);
			return block ? blockWrapper(node, block.key, block.kind) : node;
		}),
	};
}

export async function compilePlan(source: string): Promise<Root> {
	const highlighter = await getHighlighter();
	const analysis = analyzePlan(source);
	if (!analysis.tree) {
		const message =
			analysis.report.findings.find((finding) => finding.rule === "valid-mdx")?.message ??
			"The document could not be parsed.";
		throw new Error(message);
	}
	const typedHighlighter = highlighter as unknown as Parameters<typeof rehypeShikiFromHighlighter>[0];
	const pipeline = unified()
		.use(remarkParse)
		.use(remarkFrontmatter, ["yaml"])
		.use(remarkGfm)
		.use(remarkMdx)
		.use(remarkRehype, { passThrough: [...MDX_NODES] })
		.use(rehypeShikiFromHighlighter, typedHighlighter, {
			themes: { light: "github-light", dark: "github-dark" },
			defaultColor: false,
			fallbackLanguage: "text",
		});
	const tree = (await pipeline.run(analysis.tree)) as Root;
	return annotateBlocks(tree, analysis.blocks);
}
