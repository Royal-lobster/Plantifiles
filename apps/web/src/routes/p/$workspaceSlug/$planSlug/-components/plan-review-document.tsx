import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useMemo, useState } from "react";
import type { PlanReaderData } from "../-data/plan-reader";
import { createCommentForPage, resolveDecisionForPage, setCommentResolvedForPage } from "../-data/plan-review";
import { type CreateCommentValue, PlanRenderProvider, type ReviewResult } from "./plan-render-context";
import { CommentLayer, DetachedCommentThreads } from "./plan-review-components";

export function PlanReviewDocument({
	data,
	isCurrentVersion,
	commentMode,
	children,
}: {
	data: PlanReaderData;
	isCurrentVersion: boolean;
	commentMode: boolean;
	children: ReactNode;
}) {
	const router = useRouter();
	const createComment = useServerFn(createCommentForPage);
	const setCommentResolved = useServerFn(setCommentResolvedForPage);
	const resolveDecision = useServerFn(resolveDecisionForPage);
	const [message, setMessage] = useState("");
	const [reloadNeeded, setReloadNeeded] = useState(false);
	const versionNumberById = useMemo(
		() => Object.fromEntries(data.versions.map((version) => [version.id, version.number])),
		[data.versions],
	);

	async function refresh(message: string) {
		try {
			await router.invalidate();
			setMessage(message);
			setReloadNeeded(false);
		} catch {
			setMessage(
				`${message} The change was saved, but this view could not refresh; reload the page to see the latest data.`,
			);
			setReloadNeeded(true);
		}
	}

	async function handleCreateComment(value: CreateCommentValue) {
		await createComment({ data: { planId: data.plan.id, ...value } });
		await refresh("Comment added.");
	}

	async function handleResolveComment(commentId: string, resolved: boolean) {
		await setCommentResolved({ data: { commentId, resolved } });
		await refresh(resolved ? "Comment resolved." : "Comment reopened.");
	}

	async function handleResolveDecision(key: string, resolution: string): Promise<ReviewResult> {
		const result = await resolveDecision({ data: { planId: data.plan.id, key, resolution } });
		await refresh(result.reason ?? "Decision resolved.");
		return { ...result, reason: null };
	}

	return (
		<section className="mt-10" aria-label="Plantifile document">
			{message ? (
				<output className="mb-5 block text-muted-foreground text-sm" aria-live="polite">
					{message}
				</output>
			) : null}
			<div className="relative min-w-0 space-y-7">
				<PlanRenderProvider
					decisions={data.decisions}
					comments={data.comments}
					selectedVersionNumber={data.version.number}
					blocks={data.blocks}
					viewer={reloadNeeded ? null : data.viewer}
					commentMode={commentMode}
					isCurrentVersion={isCurrentVersion}
					versionNumberById={versionNumberById}
					workspaceSlug={data.workspace.slug}
					planSlug={data.plan.slug}
					onCreateComment={handleCreateComment}
					onResolveComment={handleResolveComment}
					onResolveDecision={handleResolveDecision}
				>
					<CommentLayer>{children}</CommentLayer>
					<DetachedCommentThreads />
				</PlanRenderProvider>
			</div>
		</section>
	);
}
