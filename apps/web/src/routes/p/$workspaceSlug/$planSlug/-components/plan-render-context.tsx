import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ReaderDecision = { key: string; status: "open" | "resolved"; resolution: string | null };
type ReaderComment = {
	id: string;
	versionId: string;
	blockKey: string | null;
	parentId: string | null;
	body: string;
	agentAssisted: boolean;
	resolvedAt: string | null;
	createdAt: string;
	author: { id: string; name: string; image: string | null };
};
type ReaderViewer = { id: string; name: string; image: string | null };
type CreateCommentValue = { blockKey?: string; parentId?: string; body: string; agentAssisted?: boolean };
type ReviewResult = { status: string; reason: string | null };
type PlanBlockSummary = { key: string; kind: string; contentHash: string };
type PlanCommentIndex = {
	visibleComments: ReaderComment[];
	rootsByBlockKey: ReadonlyMap<string, readonly ReaderComment[]>;
	detachedRoots: ReaderComment[];
	repliesByParentId: ReadonlyMap<string, readonly ReaderComment[]>;
};
type PlanRenderContextValue = {
	decisions: ReaderDecision[];
	selectedBlockKeys: Record<string, true>;
	rootsByBlockKey: ReadonlyMap<string, readonly ReaderComment[]>;
	detachedRoots: ReaderComment[];
	repliesByParentId: ReadonlyMap<string, readonly ReaderComment[]>;
	/** Figure numbers by block key, so diagrams can be cited like a manuscript. */
	figureNumbers: Record<string, number>;
	/** Phase blocks that are followed by another phase, which draw the spine on. */
	phaseContinues: Record<string, true>;
	contentHashByBlockKey: Record<string, string>;
	/** Block kinds by key, so the composer can name the block it is anchored to. */
	kindByBlockKey: Record<string, string>;
	/** True while the reader is pointing at blocks to comment on, rather than reading. */
	commentMode: boolean;
	/** The one block whose composer popover is open. Only one can be open at a time. */
	activeBlockKey: string | null;
	setActiveBlockKey: (key: string | null) => void;
	viewer: ReaderViewer | null;
	isCurrentVersion: boolean;
	versionNumberById: Record<string, number>;
	workspaceSlug: string;
	planSlug: string;
	onCreateComment?: ((value: CreateCommentValue) => Promise<void>) | undefined;
	onResolveComment?: ((commentId: string, resolved: boolean) => Promise<void>) | undefined;
	onResolveDecision?: ((key: string, resolution: string) => Promise<ReviewResult>) | undefined;
};

const PlanRenderContext = createContext<PlanRenderContextValue | null>(null);

/**
 * Figures are numbered once, from the block list, so the caption, the margin
 * mark, and the lightbox title all cite the same figure; the same pass records
 * which phase blocks are followed by another phase and so draw the spine on.
 */
function planBlockIndex(blocks: PlanBlockSummary[]): {
	selectedBlockKeys: Record<string, true>;
	figureNumbers: Record<string, number>;
	phaseContinues: Record<string, true>;
	contentHashByBlockKey: Record<string, string>;
	kindByBlockKey: Record<string, string>;
} {
	const figureNumbers: Record<string, number> = {};
	const selectedBlockKeys: Record<string, true> = {};
	const phaseContinues: Record<string, true> = {};
	const contentHashByBlockKey: Record<string, string> = {};
	const kindByBlockKey: Record<string, string> = {};
	let figure = 1;
	blocks.forEach((block, index) => {
		selectedBlockKeys[block.key] = true;
		contentHashByBlockKey[block.key] = block.contentHash;
		kindByBlockKey[block.key] = block.kind;
		if (block.kind === "Diagram") {
			figureNumbers[block.key] = figure;
			figure += 1;
		}
		if (block.kind === "Phase" && blocks[index + 1]?.kind === "Phase") phaseContinues[block.key] = true;
	});
	return { contentHashByBlockKey, figureNumbers, kindByBlockKey, phaseContinues, selectedBlockKeys };
}

/**
 * Builds every comment lookup in one pass and excludes comments from versions
 * newer than the document being read. Roots keep their original anchor when
 * that block survives in the selected version; otherwise they move to the
 * detached-thread collection.
 */
function planCommentIndex(
	comments: ReaderComment[],
	selectedVersionNumber: number,
	selectedBlockKeys: Record<string, true>,
	versionNumberById: Record<string, number>,
): PlanCommentIndex {
	const visibleComments: ReaderComment[] = [];
	const rootsByBlockKey = new Map<string, ReaderComment[]>();
	const detachedRoots: ReaderComment[] = [];
	const repliesByParentId = new Map<string, ReaderComment[]>();

	for (const comment of comments) {
		const commentVersionNumber = versionNumberById[comment.versionId];
		if (commentVersionNumber === undefined || commentVersionNumber > selectedVersionNumber) continue;
		visibleComments.push(comment);
		if (comment.parentId) {
			const replies = repliesByParentId.get(comment.parentId);
			if (replies) replies.push(comment);
			else repliesByParentId.set(comment.parentId, [comment]);
			continue;
		}
		if (!comment.blockKey) continue;
		if (!selectedBlockKeys[comment.blockKey]) {
			detachedRoots.push(comment);
			continue;
		}
		const roots = rootsByBlockKey.get(comment.blockKey);
		if (roots) roots.push(comment);
		else rootsByBlockKey.set(comment.blockKey, [comment]);
	}

	return { visibleComments, rootsByBlockKey, detachedRoots, repliesByParentId };
}

function usePlanRender() {
	const context = useContext(PlanRenderContext);
	if (!context) throw new Error("Plan components must be rendered inside PlanRenderProvider.");
	return context;
}

function PlanRenderProvider({
	children,
	blocks,
	decisions,
	comments,
	selectedVersionNumber,
	viewer,
	commentMode,
	isCurrentVersion,
	versionNumberById,
	workspaceSlug,
	planSlug,
	onCreateComment,
	onResolveComment,
	onResolveDecision,
}: {
	children: ReactNode;
	blocks: PlanBlockSummary[];
	decisions: ReaderDecision[];
	comments: ReaderComment[];
	selectedVersionNumber: number;
	viewer: ReaderViewer | null;
	commentMode: boolean;
	isCurrentVersion: boolean;
	versionNumberById: Record<string, number>;
	workspaceSlug: string;
	planSlug: string;
	onCreateComment?: (value: CreateCommentValue) => Promise<void>;
	onResolveComment?: (commentId: string, resolved: boolean) => Promise<void>;
	onResolveDecision?: (key: string, resolution: string) => Promise<ReviewResult>;
}) {
	const [activeBlockKey, setActiveBlockKey] = useState<string | null>(null);
	/* Leaving comment mode dismisses the open composer, so re-entering it starts
	   from a clean document instead of reopening the last block's popover. */
	useEffect(() => {
		if (!commentMode) setActiveBlockKey(null);
	}, [commentMode]);
	const { contentHashByBlockKey, figureNumbers, kindByBlockKey, phaseContinues, selectedBlockKeys } = useMemo(
		() => planBlockIndex(blocks),
		[blocks],
	);
	const { rootsByBlockKey, detachedRoots, repliesByParentId } = useMemo(
		() => planCommentIndex(comments, selectedVersionNumber, selectedBlockKeys, versionNumberById),
		[comments, selectedVersionNumber, selectedBlockKeys, versionNumberById],
	);
	const value = useMemo(
		() => ({
			decisions,
			selectedBlockKeys,
			rootsByBlockKey,
			detachedRoots,
			repliesByParentId,
			figureNumbers,
			phaseContinues,
			contentHashByBlockKey,
			kindByBlockKey,
			viewer,
			commentMode,
			activeBlockKey,
			setActiveBlockKey,
			isCurrentVersion,
			versionNumberById,
			workspaceSlug,
			planSlug,
			onCreateComment,
			onResolveComment,
			onResolveDecision,
		}),
		[
			decisions,
			selectedBlockKeys,
			rootsByBlockKey,
			detachedRoots,
			repliesByParentId,
			figureNumbers,
			contentHashByBlockKey,
			kindByBlockKey,
			phaseContinues,
			viewer,
			commentMode,
			activeBlockKey,
			isCurrentVersion,
			versionNumberById,
			workspaceSlug,
			planSlug,
			onCreateComment,
			onResolveComment,
			onResolveDecision,
		],
	);
	return <PlanRenderContext.Provider value={value}>{children}</PlanRenderContext.Provider>;
}

export type { CreateCommentValue, ReaderComment, ReviewResult };
export { PlanRenderProvider, planCommentIndex, usePlanRender };
