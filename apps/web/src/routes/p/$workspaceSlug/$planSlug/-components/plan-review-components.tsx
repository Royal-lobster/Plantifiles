import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import { Textarea } from "@plantifiles/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plantifiles/ui/components/tooltip";
import { cn } from "@plantifiles/ui/lib/utils";
import { Bot, Check, CheckCircle2, CircleDot, HelpCircle, MessageSquare, Plus, Reply } from "lucide-react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { StateLabel } from "#/components/state-label";
import type { ReaderComment } from "./plan-render-context";
import { usePlanRender } from "./plan-render-context";

type PlanBlockProps = ComponentProps<"div"> & {
	node?: unknown;
	"data-block-kind"?: string;
	"data-block-key"?: string;
};

/* Only blocks that carry a claim take comments. Prose does not: a hover-only
   affordance on every paragraph reserved an invisible row above each one, which
   read as a stray gap, and reviewers argue with claims rather than sentences. */
const COMMENTABLE: Record<string, true> = {
	TLDR: true,
	Decision: true,
	Tradeoff: true,
	Risk: true,
	Diagram: true,
	Phase: true,
	Rejected: true,
	CodeSketch: true,
	Callout: true,
	Check: true,
};

const EMPTY_COMMENTS: readonly ReaderComment[] = [];

/**
 * Block affordances sit inline, right-aligned, above their block. They used to
 * swing into a left gutter, which pushed labels outside the column and left the
 * page ragged on one side; one column with even edges reads better.
 */
function BlockMargin({ spaced, children }: { spaced: boolean; children: ReactNode }) {
	return <div className={cn("flex flex-wrap items-center justify-end gap-2", spaced && "mb-1.5")}>{children}</div>;
}

function PlanBlock({ node: _node, className, children, ...props }: PlanBlockProps) {
	const context = usePlanRender();
	const [composing, setComposing] = useState(false);
	const kind = typeof props["data-block-kind"] === "string" ? props["data-block-kind"] : undefined;
	const key = typeof props["data-block-key"] === "string" ? props["data-block-key"] : undefined;
	if (!key)
		return (
			<div className={className} {...props}>
				{children}
			</div>
		);
	const threads = context.rootsByBlockKey.get(key) ?? EMPTY_COMMENTS;
	const openThreads = threads.reduce((count, item) => count + (item.resolvedAt ? 0 : 1), 0);
	const canComment = Boolean(
		kind &&
			COMMENTABLE[kind] &&
			context.viewerId &&
			context.isCurrentVersion &&
			context.selectedBlockKeys[key] &&
			context.onCreateComment,
	);
	const figure = context.figureNumbers[key];
	// The Decision card header already carries an OPEN/RESOLVED pill, so the old
	// margin label only said it twice.
	const marks = Boolean(figure !== undefined || threads.length > 0);
	const hasMargin = marks || canComment;
	const spaced = marks || canComment;
	return (
		<div className={cn("group/plan-block relative scroll-mt-20", className)} {...props}>
			{hasMargin && (
				<BlockMargin spaced={spaced}>
					{figure !== undefined && (
						<a
							href={`#${encodeURIComponent(key)}`}
							className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em] hover:text-brand-ink"
						>
							Fig. {figure}
						</a>
					)}

					{threads.length > 0 && (
						<span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
							<MessageSquare className="size-3" />
							{openThreads > 0 ? `${openThreads} open` : `${threads.length}`}
						</span>
					)}
					{canComment && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="quiet"
									size="icon-xs"
									className="opacity-70 transition-opacity hover:opacity-100"
									aria-label={`Comment on ${kind ?? "block"}`}
									onClick={() => setComposing((value) => !value)}
								>
									<Plus />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left">Comment</TooltipContent>
						</Tooltip>
					)}
				</BlockMargin>
			)}
			{children}
			{(threads.length > 0 || composing) && (
				<section
					aria-label={`${kind ?? "Block"} comments`}
					className="mt-4 space-y-3 border-brand-ink/25 border-l-2 pl-4"
				>
					{threads.map((thread) => (
						<CommentThread key={thread.id} comment={thread} />
					))}
					{composing && context.onCreateComment && (
						<CommentComposer
							label={`Comment on ${kind ?? "block"}`}
							onCancel={() => setComposing(false)}
							onSubmit={async (body) => {
								await context.onCreateComment?.({ blockKey: key, body });
								setComposing(false);
							}}
						/>
					)}
				</section>
			)}
		</div>
	);
}

function CommentComposer({
	label,
	onSubmit,
	onCancel,
}: {
	label: string;
	onSubmit: (body: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const inputId = useId();
	const errorId = useId();
	const [error, setError] = useState("");
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!body.trim()) return;
		setBusy(true);
		setError("");
		try {
			await onSubmit(body.trim());
			setBody("");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not save comment.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<form className="surface-card space-y-3 p-5" onSubmit={submit}>
			<label className="label-eyebrow" htmlFor={inputId}>
				{label}
			</label>
			<Textarea
				id={inputId}
				value={body}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? errorId : undefined}
				onChange={(event) => setBody(event.target.value)}
				placeholder="Leave a review comment"
				className="min-h-20"
			/>
			{error && (
				<p id={errorId} className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={busy || !body.trim()}>
					{busy ? "Saving…" : "Comment"}
				</Button>
			</div>
		</form>
	);
}

function CommentThread({ comment: root }: { comment: ReaderComment }) {
	const context = usePlanRender();
	const [replying, setReplying] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const replies = context.repliesByParentId.get(root.id) ?? EMPTY_COMMENTS;
	const canReply = Boolean(context.viewerId && context.isCurrentVersion && !root.resolvedAt && context.onCreateComment);
	async function toggleResolved() {
		if (!context.onResolveComment) return;
		setBusy(true);
		setError("");
		try {
			await context.onResolveComment(root.id, !root.resolvedAt);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update comment.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<article
			className={cn("space-y-2 text-sm", root.resolvedAt && "opacity-60")}
			aria-label={`Comment by ${root.author.name}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2 text-xs">
					<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-ink/15 font-semibold text-[10px] text-brand-ink">
						{root.author.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="truncate font-medium">{root.author.name}</span>
					<time className="font-mono text-muted-foreground" dateTime={root.createdAt}>
						{root.createdAt.slice(0, 10)}
					</time>
					{root.agentAssisted && (
						<span className="inline-flex items-center gap-1 text-muted-foreground" title="Agent-assisted comment">
							<Bot className="size-3" /> agent
						</span>
					)}
				</div>
				{root.resolvedAt && (
					<Badge variant="success" size="sm">
						<CheckCircle2 className="size-3" /> Resolved
					</Badge>
				)}
			</div>
			<p className="whitespace-pre-wrap leading-6">{root.body}</p>
			{replies.map((reply) => (
				<article
					key={reply.id}
					className="ml-3 border-l border-foreground/[0.08] pl-3"
					aria-label={`Reply by ${reply.author.name}`}
				>
					<div className="mb-1 flex items-center gap-2 text-xs">
						<span className="font-medium">{reply.author.name}</span>
						<time className="font-mono text-muted-foreground" dateTime={reply.createdAt}>
							{reply.createdAt.slice(0, 10)}
						</time>
						{reply.agentAssisted && <Bot className="size-3 text-muted-foreground" aria-label="Agent-assisted reply" />}
					</div>
					<p className="whitespace-pre-wrap leading-6">{reply.body}</p>
				</article>
			))}
			{error && <p className="text-destructive text-xs">{error}</p>}
			{context.viewerId && context.isCurrentVersion && (
				<div className="flex gap-1">
					{canReply && (
						<Button type="button" variant="quiet" size="xs" onClick={() => setReplying((value) => !value)}>
							<Reply /> Reply
						</Button>
					)}
					<Button type="button" variant="quiet" size="xs" disabled={busy} onClick={toggleResolved}>
						<CheckCircle2 /> {root.resolvedAt ? "Reopen" : "Resolve"}
					</Button>
				</div>
			)}
			{replying && context.onCreateComment && (
				<CommentComposer
					label={`Reply to ${root.author.name}`}
					onCancel={() => setReplying(false)}
					onSubmit={async (body) => {
						await context.onCreateComment?.({ parentId: root.id, body });
						setReplying(false);
					}}
				/>
			)}
		</article>
	);
}

function DetachedCommentThreads() {
	const context = usePlanRender();
	const roots = context.detachedRoots;
	if (roots.length === 0) return null;
	return (
		<details className="mt-12 border-t border-foreground/[0.08] pt-6" aria-label="Comments from earlier versions">
			<summary className="label-eyebrow cursor-pointer">From an earlier version ({roots.length})</summary>
			<div className="mt-4 space-y-5">
				{roots.map((thread) => {
					const version = context.versionNumberById[thread.versionId];
					return (
						<div key={thread.id} className="space-y-2">
							{version && (
								<a
									className="font-mono text-brand-ink text-xs underline underline-offset-4"
									href={`/p/${context.workspaceSlug}/${context.planSlug}/v/${version}`}
								>
									Anchored on v{version}
								</a>
							)}
							<CommentThread comment={thread} />
						</div>
					);
				})}
			</div>
		</details>
	);
}

function Decision({ owner, blockKey, children }: { owner: string; blockKey?: string; children?: ReactNode }) {
	const context = usePlanRender();
	const [resolving, setResolving] = useState(false);
	const [resolution, setResolution] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const resolutionId = useId();
	const record = context.decisions.find((item) => item.key === blockKey);
	const status = record?.status ?? "open";
	const canResolve = Boolean(
		context.viewerId && context.isCurrentVersion && status === "open" && blockKey && context.onResolveDecision,
	);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!blockKey || !resolution.trim() || !context.onResolveDecision) return;
		setBusy(true);
		setError("");
		try {
			const result = await context.onResolveDecision(blockKey, resolution.trim());
			if (result.reason) setError(result.reason);
			else setResolving(false);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not resolve decision.");
		} finally {
			setBusy(false);
		}
	}
	/* One record for the open/resolved reading, so the ring, the header wash, the
	   eyebrow icon and the state label cannot drift apart. */
	const presentation =
		status === "open"
			? {
					ring: "ring-decision/35",
					header: "border-decision/25 bg-decision/[0.07]",
					eyebrow: "text-decision",
					state: { icon: CircleDot, ink: "text-decision" },
				}
			: {
					ring: "",
					header: "border-foreground/[0.06] bg-muted/40",
					eyebrow: "text-muted-foreground",
					state: { icon: CheckCircle2, ink: "text-success" },
				};
	return (
		<section className={cn("surface-card overflow-hidden", presentation.ring)}>
			<header className={cn("flex flex-wrap items-center gap-2 border-b px-5 py-3", presentation.header)}>
				<HelpCircle className={cn("size-4", presentation.eyebrow)} />
				<h3 className="label-eyebrow text-foreground">Decision</h3>
				<span className="ml-auto font-mono text-muted-foreground text-xs">{owner}</span>
				<StateLabel icon={presentation.state.icon} ink={presentation.state.ink}>
					{status}
				</StateLabel>
			</header>
			<div className="px-5 py-5 [&>p]:text-lg [&>p]:text-foreground [&>p]:leading-[1.55]">{children}</div>
			{record?.resolution && (
				<footer className="flex gap-2.5 border-t border-foreground/[0.06] bg-success/[0.06] px-5 py-4 text-sm">
					<Check className="mt-0.5 size-4 shrink-0 text-success" />
					<p className="leading-6">{record.resolution}</p>
				</footer>
			)}
			{canResolve && (
				<div className="border-t border-foreground/[0.06] px-5 py-4">
					{!resolving ? (
						<Button type="button" size="sm" variant="outline" onClick={() => setResolving(true)}>
							Resolve decision
						</Button>
					) : (
						<form className="space-y-2" onSubmit={submit}>
							<label className="label-eyebrow" htmlFor={resolutionId}>
								Resolution
							</label>
							<Textarea
								id={resolutionId}
								value={resolution}
								onChange={(event) => setResolution(event.target.value)}
								placeholder="Record the outcome and rationale"
								className="min-h-20"
							/>
							{error && <p className="text-destructive text-xs">{error}</p>}
							<div className="flex justify-end gap-2">
								<Button type="button" size="sm" variant="ghost" onClick={() => setResolving(false)}>
									Cancel
								</Button>
								<Button type="submit" size="sm" disabled={busy || !resolution.trim()}>
									{busy ? "Saving…" : "Save resolution"}
								</Button>
							</div>
						</form>
					)}
				</div>
			)}
		</section>
	);
}

export { Decision, DetachedCommentThreads, PlanBlock };
