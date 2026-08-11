import type { Block, SkimBlock } from "./types.js";

const SKIM_KINDS = new Set(["TLDR", "Decision", "Tradeoff", "Risk", "Diagram", "Phase"]);

export function skim(blocks: Block[]): SkimBlock[] {
	return blocks
		.filter((block) => SKIM_KINDS.has(block.kind))
		.map((block) => ({
			key: block.key,
			kind: block.kind,
			ordinal: block.ordinal,
			source: block.kind === "Phase" ? (block.title ?? block.source) : block.source,
			...(block.title ? { title: block.title } : {}),
		}));
}
