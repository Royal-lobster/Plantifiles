import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@plantifiles/ui/components/popover";
import { Textarea } from "@plantifiles/ui/components/textarea";
import { cn } from "@plantifiles/ui/lib/utils";
import { Bot, Check, CheckCircle2, CircleDot, HelpCircle, MessageSquare, Reply } from "lucide-react";
import type { ComponentProps, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { StateLabel } from "#/components/state-label";
import type { ReaderComment } from "./plan-render-context";
import { usePlanRender } from "./plan-render-context";

type PlanBlockProps = ComponentProps<"div"> & {
	node?: unknown;
	"data-block-kind"?: string;
	"data-block-key"?: string;
};

const EMPTY_COMMENTS: readonly ReaderComment[] = [];

/**
 * Block marks sit inline, right-aligned, above their block. They used to swing
 * into a left gutter, which pushed labels outside the column and left the page
 * ragged on one side; one column with even edges reads better.
 */
function BlockMargin({ children }: { children: ReactNode }) {
	return <div className="mb-1.5 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

function AuthorAvatar({ name, image, className }: { name: string; image: string | null; className?: string }) {
	if (image) return <img src={image} alt="" className={cn("size-5 shrink-0 rounded-full object-cover", className)} />;
	return (
		<span
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-ink/15 font-semibold text-[10px] text-brand-ink",
				className,
			)}
		>
			{name.slice(0, 1).toUpperCase()}
		</span>
	);
}

/**
 * In comment mode the whole block becomes one target: point at it, click, and
 * the composer opens against it. A per-block button used to sit in the margin
 * of every commentable block, which reserved a row above each one and read as a
 * stray gap; nothing is reserved now, so every block can take a comment.
 *
 * The target is only an anchor, never its own popover: one Radix layer per
 * block meant clicking block B while A was open let A's dismissal race B's
 * trigger, and the reviewer landed on nothing and had to click twice.
 */
function CommentTarget({
	blockKey,
	kind,
	children,
}: {
	blockKey: string;
	kind: string | undefined;
	children: ReactNode;
}) {
	const context = usePlanRender();
	const active = context.activeBlockKey === blockKey;
	const target = (
		<div className="relative">
			{children}
			<button
				type="button"
				data-comment-target=""
				aria-label={`Comment on ${kind ?? "block"}`}
				aria-expanded={active}
				onClick={() => context.setActiveBlockKey(blockKey)}
				className={cn(
					"-inset-x-2 -inset-y-1 absolute z-10 cursor-crosshair rounded-xl transition-colors",
					active
						? "bg-brand-ink/[0.06] ring-2 ring-brand-ink/60"
						: "hover:bg-brand-ink/[0.04] hover:ring-2 hover:ring-brand-ink/40",
				)}
			/>
		</div>
	);
	return active ? <PopoverAnchor asChild>{target}</PopoverAnchor> : target;
}

/**
 * One composer for the whole document, re-anchored to whichever block is being
 * commented on. Pointer and focus escapes into another target keep it open so
 * that target's click can move it, rather than closing it out from under the
 * reviewer; everything else — Escape, a click into the prose — dismisses.
 */
function CommentLayer({ children }: { children: ReactNode }) {
	const context = usePlanRender();
	const blockKey = context.activeBlockKey;
	const viewer = context.viewer;
	const kind = blockKey ? context.kindByBlockKey[blockKey] : undefined;
	return (
		<Popover
			open={blockKey !== null}
			onOpenChange={(next) => {
				if (!next) context.setActiveBlockKey(null);
			}}
		>
			{children}
			{blockKey !== null && (
				<PopoverContent
					side="bottom"
					align="start"
					collisionPadding={16}
					className="space-y-3"
					onInteractOutside={(event) => {
						/* A press on another target must move the composer, not dismiss it
						   out from under the click that is about to re-anchor it. */
						if (event.target instanceof Element && event.target.closest("[data-comment-target]"))
							event.preventDefault();
					}}
				>
					{viewer && (
						<div className="flex items-center gap-2 text-xs">
							<AuthorAvatar name={viewer.name} image={viewer.image} />
							<span className="truncate font-medium">{viewer.name}</span>
						</div>
					)}
					{/* A new anchor is a new draft: keying on the block discards whatever
					    was half-typed against the previous one. */}
					<CommentComposer
						key={blockKey}
						label={`Comment on ${kind ?? "block"}`}
						placeholder="Add a comment"
						submitLabel="Comment"
						autoFocus
						onSubmit={async (body) => {
							await context.onCreateComment?.({ blockKey, body });
							context.setActiveBlockKey(null);
						}}
					/>
				</PopoverContent>
			)}
		</Popover>
	);
}

function PlanBlock({ node: _node, className, children, ...props }: PlanBlockProps) {
	const context = usePlanRender();
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
		context.viewer && context.isCurrentVersion && context.selectedBlockKeys[key] && context.onCreateComment,
	);
	const figure = context.figureNumbers[key];
	// The Decision card header already carries an OPEN/RESOLVED pill, so the old
	// margin label only said it twice.
	const marks = figure !== undefined || threads.length > 0;
	return (
		<div className={cn("scroll-mt-20", className)} {...props}>
			{marks && (
				<BlockMargin>
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
				</BlockMargin>
			)}
			{context.commentMode && canComment ? (
				<CommentTarget blockKey={key} kind={kind}>
					{children}
				</CommentTarget>
			) : (
				children
			)}
			{threads.length > 0 && (
				<section
					aria-label={`${kind ?? "Block"} comments`}
					className="mt-4 space-y-3 border-brand-ink/25 border-l-2 pl-4"
				>
					{threads.map((thread) => (
						<CommentThread key={thread.id} comment={thread} />
					))}
				</section>
			)}
		</div>
	);
}

/**
 * One field, one button. The composer is dismissed by whatever opened it — the
 * popover closes on Escape or an outside click, the reply toggle closes itself
 * — so a second, competing action would only crowd the send.
 */
function CommentComposer({
	label,
	placeholder,
	submitLabel,
	autoFocus,
	onSubmit,
}: {
	label: string;
	placeholder: string;
	submitLabel: string;
	autoFocus?: boolean;
	onSubmit: (body: string) => Promise<void>;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const errorId = useId();
	const [error, setError] = useState("");
	async function send() {
		if (!body.trim() || busy) return;
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
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await send();
	}
	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		void send();
	}
	return (
		<form className="space-y-2" onSubmit={submit}>
			<Textarea
				value={body}
				aria-label={label}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? errorId : undefined}
				autoFocus={autoFocus}
				onChange={(event) => setBody(event.target.value)}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				className="min-h-20"
			/>
			{error && (
				<p id={errorId} className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={busy || !body.trim()}>
					{busy ? "Saving…" : submitLabel}
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
	const canReply = Boolean(context.viewer && context.isCurrentVersion && !root.resolvedAt && context.onCreateComment);
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
					<AuthorAvatar name={root.author.name} image={root.author.image} />
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
			{context.viewer && context.isCurrentVersion && (
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
					placeholder="Reply"
					submitLabel="Reply"
					autoFocus
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
		context.viewer && context.isCurrentVersion && status === "open" && blockKey && context.onResolveDecision,
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

export { CommentLayer, Decision, DetachedCommentThreads, PlanBlock };
