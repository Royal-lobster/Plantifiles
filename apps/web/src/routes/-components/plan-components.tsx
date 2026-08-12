import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import { ButtonGroup, ButtonGroupButton, ButtonGroupLabel } from "@plantifiles/ui/components/button-group";
import { Checkbox } from "@plantifiles/ui/components/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@plantifiles/ui/components/dialog";
import { Textarea } from "@plantifiles/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plantifiles/ui/components/tooltip";
import { cn } from "@plantifiles/ui/lib/utils";
import {
	AlertTriangle,
	Bot,
	Check,
	CheckCircle2,
	ChevronRight,
	Copy,
	HelpCircle,
	Info,
	Maximize2,
	MessageSquare,
	Minus,
	Plus,
	Reply,
	RotateCcw,
	Scale,
	X,
} from "lucide-react";
import type {
	ComponentProps,
	FormEvent,
	ReactElement,
	KeyboardEvent as ReactKeyboardEvent,
	ReactNode,
	PointerEvent as ReactPointerEvent,
	WheelEvent as ReactWheelEvent,
} from "react";
import { createContext, isValidElement, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

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
type CreateCommentValue = { blockKey?: string; parentId?: string; body: string; agentAssisted?: boolean };
type ReviewResult = { status: string; reason: string | null };
type RiskSeverity = "low" | "med" | "high";
/** The slice of a normalized block the reader's presentation actually needs. */
type PlanBlockSummary = { key: string; kind: string };
type PlanBlockProps = ComponentProps<"div"> & {
	node?: unknown;
	"data-block-kind"?: string;
	"data-block-key"?: string;
};
type PlanRenderContextValue = {
	decisions: ReaderDecision[];
	comments: ReaderComment[];
	currentBlockKeys: Record<string, true>;
	/** Figure numbers by block key, so diagrams can be cited like a manuscript. */
	figureNumbers: Record<string, number>;
	/** Phase blocks that are followed by another phase, which draw the spine on. */
	phaseContinues: Record<string, true>;
	viewerId: string | null;
	isCurrentVersion: boolean;
	versionNumberById: Record<string, number>;
	workspaceSlug: string;
	planSlug: string;
	onCreateComment?: ((value: CreateCommentValue) => Promise<void>) | undefined;
	onResolveComment?: ((commentId: string, resolved: boolean) => Promise<void>) | undefined;
	onResolveDecision?: ((key: string, resolution: string) => Promise<ReviewResult>) | undefined;
};

const PlanRenderContext = createContext<PlanRenderContextValue>({
	decisions: [],
	comments: [],
	currentBlockKeys: {},
	figureNumbers: {},
	phaseContinues: {},
	viewerId: null,
	isCurrentVersion: false,
	versionNumberById: {},
	workspaceSlug: "",
	planSlug: "",
});

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
};

/**
 * Figures are numbered once, from the block list, so the caption, the margin
 * mark, and the lightbox title all cite the same figure; the same pass records
 * which phase blocks are followed by another phase and so draw the spine on.
 */
function planBlockIndex(blocks: PlanBlockSummary[]): {
	figureNumbers: Record<string, number>;
	phaseContinues: Record<string, true>;
} {
	const figureNumbers: Record<string, number> = {};
	const phaseContinues: Record<string, true> = {};
	let figure = 1;
	blocks.forEach((block, index) => {
		if (block.kind === "Diagram") {
			figureNumbers[block.key] = figure;
			figure += 1;
		}
		if (block.kind === "Phase" && blocks[index + 1]?.kind === "Phase") phaseContinues[block.key] = true;
	});
	return { figureNumbers, phaseContinues };
}

function PlanRenderProvider({
	children,
	blocks,
	decisions,
	comments,
	currentBlockKeys,
	viewerId,
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
	currentBlockKeys: Record<string, true>;
	viewerId: string | null;
	isCurrentVersion: boolean;
	versionNumberById: Record<string, number>;
	workspaceSlug: string;
	planSlug: string;
	onCreateComment?: (value: CreateCommentValue) => Promise<void>;
	onResolveComment?: (commentId: string, resolved: boolean) => Promise<void>;
	onResolveDecision?: (key: string, resolution: string) => Promise<ReviewResult>;
}) {
	const { figureNumbers, phaseContinues } = useMemo(() => planBlockIndex(blocks), [blocks]);
	const value = useMemo(
		() => ({
			decisions,
			comments,
			currentBlockKeys,
			figureNumbers,
			phaseContinues,
			viewerId,
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
			comments,
			currentBlockKeys,
			figureNumbers,
			phaseContinues,
			viewerId,
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

/**
 * Block affordances sit inline, right-aligned, above their block. They used to
 * swing into a left gutter, which pushed labels outside the column and left the
 * page ragged on one side; one column with even edges reads better.
 */
function BlockMargin({ spaced, children }: { spaced: boolean; children: ReactNode }) {
	return <div className={cn("flex flex-wrap items-center justify-end gap-2", spaced && "mb-1.5")}>{children}</div>;
}

function PlanBlock({ node: _node, className, children, ...props }: PlanBlockProps) {
	const context = useContext(PlanRenderContext);
	const [composing, setComposing] = useState(false);
	const kind = typeof props["data-block-kind"] === "string" ? props["data-block-kind"] : undefined;
	const key = typeof props["data-block-key"] === "string" ? props["data-block-key"] : undefined;
	if (!key)
		return (
			<div className={className} {...props}>
				{children}
			</div>
		);
	const threads = context.comments.filter((item) => item.blockKey === key && !item.parentId);
	const openThreads = threads.filter((item) => !item.resolvedAt).length;
	const canComment = Boolean(
		kind &&
			COMMENTABLE[kind] &&
			context.viewerId &&
			context.isCurrentVersion &&
			context.currentBlockKeys[key] &&
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
				<div className="mt-4 space-y-3 border-l-2 border-brand-ink/25 pl-4">
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
				</div>
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
		<form className="space-y-2 rounded-md border bg-card p-3" onSubmit={submit}>
			<label className="label-eyebrow" htmlFor={inputId}>
				{label}
			</label>
			<Textarea
				id={inputId}
				value={body}
				onChange={(event) => setBody(event.target.value)}
				placeholder="Leave a review comment"
				className="min-h-20"
			/>
			{error && <p className="text-destructive text-xs">{error}</p>}
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
	const context = useContext(PlanRenderContext);
	const [replying, setReplying] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const replies = context.comments.filter((item) => item.parentId === root.id);
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
		<div className={cn("space-y-2 text-sm", root.resolvedAt && "opacity-60")}>
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
				<div key={reply.id} className="ml-3 border-l pl-3">
					<div className="mb-1 flex items-center gap-2 text-xs">
						<span className="font-medium">{reply.author.name}</span>
						<time className="font-mono text-muted-foreground" dateTime={reply.createdAt}>
							{reply.createdAt.slice(0, 10)}
						</time>
						{reply.agentAssisted && <Bot className="size-3 text-muted-foreground" aria-label="Agent-assisted reply" />}
					</div>
					<p className="whitespace-pre-wrap leading-6">{reply.body}</p>
				</div>
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
		</div>
	);
}

function DetachedCommentThreads() {
	const context = useContext(PlanRenderContext);
	const roots = context.comments.filter(
		(item) => !item.parentId && item.blockKey && !context.currentBlockKeys[item.blockKey],
	);
	if (roots.length === 0) return null;
	return (
		<details className="mt-12 border-t pt-4">
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

function PlanParagraph({ node: _node, className, ...props }: ComponentProps<"p"> & { node?: unknown }) {
	return <p className={cn("text-[0.9375rem] text-foreground/90 leading-7", className)} {...props} />;
}

/* A rule above the section, the way a manuscript opens one, rather than an
   underline that makes every heading look like a table header. */
function PlanHeading2({ node: _node, className, ...props }: ComponentProps<"h2"> & { node?: unknown }) {
	return (
		<h2
			className={cn("mt-7 border-t pt-6 font-display font-medium text-[1.75rem] tracking-tight", className)}
			{...props}
		/>
	);
}

function PlanHeading3({ node: _node, className, ...props }: ComponentProps<"h3"> & { node?: unknown }) {
	return <h3 className={cn("mt-6 font-display font-medium text-xl tracking-tight", className)} {...props} />;
}

function PlanList({ node: _node, className, ...props }: ComponentProps<"ul"> & { node?: unknown }) {
	return <ul className={cn("my-4 space-y-2 pl-5", className)} {...props} />;
}

function PlanOrderedList({ node: _node, className, ...props }: ComponentProps<"ol"> & { node?: unknown }) {
	return <ol className={cn("my-4 list-decimal space-y-2 pl-5", className)} {...props} />;
}

function PlanListItem({ node: _node, className, ...props }: ComponentProps<"li"> & { node?: unknown }) {
	return <li className={cn("pl-1 text-sm leading-6 marker:text-muted-foreground", className)} {...props} />;
}

function PlanPre({ node: _node, className, ...props }: ComponentProps<"pre"> & { node?: unknown }) {
	return (
		<pre
			className={cn("my-4 overflow-x-auto rounded-lg border p-4 font-mono text-sm leading-6", className)}
			{...props}
		/>
	);
}

function PlanCode({ node: _node, className, ...props }: ComponentProps<"code"> & { node?: unknown }) {
	return <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)} {...props} />;
}

function PlanLink({ node: _node, className, ...props }: ComponentProps<"a"> & { node?: unknown }) {
	return (
		<a
			className={cn(
				"font-medium text-foreground underline decoration-brand-ink decoration-2 underline-offset-4 hover:text-brand-ink",
				className,
			)}
			{...props}
		/>
	);
}

function PlanInput({ node: _node, checked, ...props }: ComponentProps<"input"> & { node?: unknown }) {
	return <Checkbox checked={Boolean(checked)} disabled aria-label={props["aria-label"] ?? "Checklist item"} />;
}

/* The standfirst. A plan's first paragraph is the only thing most readers
   finish, so it is set as display type at reading size, not as a card. */
function TLDR({ children }: { children?: ReactNode }) {
	return (
		<div className="font-display text-foreground text-xl leading-[1.7] tracking-tight sm:text-[1.375rem]">
			{children}
		</div>
	);
}

function Decision({ owner, blockKey, children }: { owner: string; blockKey?: string; children?: ReactNode }) {
	const context = useContext(PlanRenderContext);
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
	return (
		<section
			className={cn(
				"overflow-hidden rounded-lg border bg-card",
				status === "open" ? "border-decision/35" : "border-border",
			)}
		>
			<header
				className={cn(
					"flex flex-wrap items-center gap-2 border-b px-5 py-2.5",
					status === "open" ? "border-decision/25 bg-decision/[0.07]" : "bg-muted/40",
				)}
			>
				<HelpCircle className={cn("size-4", status === "open" ? "text-decision" : "text-muted-foreground")} />
				<span className="label-eyebrow text-foreground">Decision</span>
				<span className="ml-auto font-mono text-muted-foreground text-xs">{owner}</span>
				<Badge variant={status === "resolved" ? "success" : "decision"} size="sm">
					{status}
				</Badge>
			</header>
			<div className="px-5 py-4 [&>p]:font-display [&>p]:text-foreground [&>p]:text-lg [&>p]:leading-[1.55]">
				{children}
			</div>
			{record?.resolution && (
				<footer className="flex gap-2.5 border-t bg-success/[0.06] px-5 py-3 text-sm">
					<Check className="mt-0.5 size-4 shrink-0 text-success" />
					<p className="leading-6">{record.resolution}</p>
				</footer>
			)}
			{canResolve && (
				<div className="border-t px-5 py-3">
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

/* A tradeoff is a weighing, so it is drawn as one: options share a beam and the
   recommended arm sits heavier than the alternatives it beat. */
function Tradeoff({ children }: { children?: ReactNode }) {
	return (
		<section>
			<header className="flex items-center gap-2 border-b pb-2">
				<Scale className="size-4 text-brand-ink" />
				<span className="label-eyebrow text-foreground">Tradeoff</span>
			</header>
			<div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{children}</div>
		</section>
	);
}

function Option({ name, recommended, children }: { name: string; recommended?: boolean; children?: ReactNode }) {
	return (
		<section
			className={cn(
				"border-t-2 px-4 pt-3 pb-4",
				recommended ? "border-brand-ink bg-brand-ink/[0.05]" : "border-border/70 text-muted-foreground",
			)}
		>
			<header className="mb-2 flex items-center gap-2">
				<span className={cn("font-medium", recommended ? "text-foreground" : "text-foreground/70")}>{name}</span>
				{recommended && (
					<Badge variant="brand" size="sm" className="ml-auto">
						Recommended
					</Badge>
				)}
			</header>
			<div className="space-y-2 text-sm leading-6">{children}</div>
		</section>
	);
}

function Rejected({ what, children }: { what: string; children?: ReactNode }) {
	return (
		<details className="group/rejected border-y py-2.5">
			<summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground text-sm">
				<ChevronRight className="size-3.5 transition-transform group-open/rejected:rotate-90" />
				<X className="size-3.5 text-destructive/70" />
				<span className="label-eyebrow">Rejected</span>
				<span className="text-foreground/70 line-through decoration-destructive/40">{what}</span>
			</summary>
			<div className="mt-2.5 pl-7 text-sm leading-6">{children}</div>
		</details>
	);
}

/* Phases are a spine: consecutive phase blocks link into one continuous line so
   delivery reads as a sequence rather than as five unrelated bordered boxes. */
function Phase({
	n,
	title,
	blockKey,
	children,
}: {
	n: string;
	title: string;
	blockKey?: string;
	children?: ReactNode;
}) {
	const { phaseContinues } = useContext(PlanRenderContext);
	const continues = Boolean(blockKey && phaseContinues[blockKey]);
	return (
		<section className="relative pl-12">
			<span
				aria-hidden
				className={cn("absolute top-9 left-[0.9375rem] w-px bg-border", continues ? "-bottom-8" : "bottom-1")}
			/>
			<span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border-2 border-phase/40 bg-background font-mono font-semibold text-phase text-xs">
				{n}
			</span>
			<h3 className="pt-1 font-display font-medium text-xl tracking-tight">{title}</h3>
			<div className="mt-3 [&_li]:flex [&_li]:items-start [&_li]:gap-2.5 [&_li]:pl-0 [&_ul]:space-y-2.5 [&_ul]:pl-0">
				{children}
			</div>
		</section>
	);
}

const RISK_LEVEL: Record<RiskSeverity, { bars: number; label: string; wrapper: string; ink: string; fill: string }> = {
	low: {
		bars: 1,
		label: "low",
		wrapper: "border-l-risk-low bg-risk-low/[0.04]",
		ink: "text-risk-low",
		fill: "bg-risk-low",
	},
	med: {
		bars: 2,
		label: "medium",
		wrapper: "border-l-risk-med bg-risk-med/[0.06]",
		ink: "text-risk-med",
		fill: "bg-risk-med",
	},
	high: {
		bars: 3,
		label: "high",
		wrapper: "border-l-risk-high bg-risk-high/[0.07]",
		ink: "text-risk-high",
		fill: "bg-risk-high",
	},
};

/* Severity is drawn, not just named: three rungs, filled to the stated level, so
   a page of risks can be scanned for the one that actually matters. */
function Risk({ severity, children }: { severity: RiskSeverity; children?: ReactNode }) {
	const level = RISK_LEVEL[severity] ?? RISK_LEVEL.med;
	return (
		<section className={cn("rounded-r-lg border border-l-[3px] p-5", level.wrapper)}>
			<header className="mb-2 flex items-center gap-2">
				<AlertTriangle className={cn("size-4", level.ink)} />
				<span className="label-eyebrow text-foreground">Risk</span>
				<span className={cn("font-mono text-[11px] uppercase tracking-[0.14em]", level.ink)}>{level.label}</span>
				<span className="ml-auto flex items-end gap-0.5" aria-hidden>
					{[0, 1, 2].map((rung) => (
						<span
							key={rung}
							className={cn(
								"w-1 rounded-sm",
								rung === 0 ? "h-1.5" : rung === 1 ? "h-2.5" : "h-3.5",
								rung < level.bars ? level.fill : "bg-current opacity-15",
							)}
						/>
					))}
				</span>
			</header>
			<div className="text-[0.9375rem] leading-7">{children}</div>
		</section>
	);
}

function reactNodeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(reactNodeText).join("");
	if (isValidElement(node)) return reactNodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
	return "";
}

/**
 * Mermaid rejects OKLCH, and every token in this theme is OKLCH, so colours are
 * pushed through a one-pixel canvas to come back as rgb().
 */
function mermaidColor(value: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext("2d");
	if (!context) return value;
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const channels = context.getImageData(0, 0, 1, 1).data;
	const red = channels[0] ?? 0;
	const green = channels[1] ?? 0;
	const blue = channels[2] ?? 0;
	const alpha = channels[3] ?? 255;
	return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function MermaidFigure({ chart, className }: { chart: string; className?: string }) {
	const reactId = useId();
	const id = useMemo(() => `plantifiles-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`, [reactId]);
	const [svg, setSvg] = useState<string>();
	const [error, setError] = useState<string>();
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = document.documentElement;
		const update = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		let active = true;
		void (async () => {
			if (import.meta.env.SSR) return;
			try {
				// Mermaid touches window/document at import time and must never reach the
				// Worker's SSR pass, so the specifier stays dynamic on purpose.
				const mermaid = (await import("mermaid")).default;
				const styles = getComputedStyle(document.documentElement);
				const token = (name: string) => mermaidColor(styles.getPropertyValue(name).trim());
				const surface = token("--background");
				const ink = token("--foreground");
				const edge = token("--diagram-edge");
				const node = token("--diagram-node");
				const quiet = token("--muted");
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: "strict",
					theme: "base",
					fontFamily: styles.getPropertyValue("--font-sans").trim() || "sans-serif",
					/* The base theme derives every colour it is not given by rotating the
					   primary hue, which turns a green product's edge labels magenta. Give
					   it the whole palette from the tokens instead. */
					themeVariables: {
						background: surface,
						mainBkg: node,
						primaryColor: node,
						primaryTextColor: ink,
						primaryBorderColor: edge,
						secondaryColor: quiet,
						secondaryTextColor: ink,
						secondaryBorderColor: edge,
						tertiaryColor: quiet,
						tertiaryTextColor: ink,
						tertiaryBorderColor: edge,
						lineColor: edge,
						textColor: ink,
						edgeLabelBackground: surface,
						labelBackgroundColor: surface,
						noteBkgColor: quiet,
						noteTextColor: ink,
						noteBorderColor: edge,
						clusterBkg: quiet,
						clusterBorder: edge,
						titleColor: ink,
					},
				});
				const rendered = await mermaid.render(`${id}-${theme}`, chart);
				if (active) {
					setSvg(rendered.svg);
					setError(undefined);
				}
			} catch (caught) {
				if (active) setError(caught instanceof Error ? caught.message : String(caught));
			}
		})();
		return () => {
			active = false;
		};
	}, [chart, id, theme]);
	useEffect(() => {
		if (!svg || !rootRef.current) return;
		const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
		if (parsed.documentElement.localName !== "svg") {
			setError("Mermaid returned invalid SVG.");
			return;
		}
		for (const script of parsed.querySelectorAll("script")) script.remove();
		for (const element of parsed.querySelectorAll("*")) {
			for (const attribute of [...element.attributes]) {
				const name = attribute.name.toLowerCase();
				if (
					name.startsWith("on") ||
					((name === "href" || name === "xlink:href") && /^\s*javascript:/i.test(attribute.value))
				) {
					element.removeAttribute(attribute.name);
				}
			}
		}
		rootRef.current.replaceChildren(document.importNode(parsed.documentElement, true));
	}, [svg]);
	if (error) return <pre className="overflow-x-auto p-4 text-destructive text-xs">{error}</pre>;
	if (!svg) return <pre className="overflow-x-auto p-4 font-mono text-muted-foreground text-xs">{chart}</pre>;
	return <div ref={rootRef} className={cn("flex justify-center", className)} />;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;

type ZoomView = { scale: number; x: number; y: number };
const ZOOM_RESET: ZoomView = { scale: 1, x: 0, y: 0 };

function DiagramLightbox({
	chart,
	figure,
	lang,
}: {
	chart: string;
	figure: number | undefined;
	lang: "mermaid" | "d2";
}) {
	const [view, setView] = useState<ZoomView>(ZOOM_RESET);
	const [copied, setCopied] = useState(false);
	const dragRef = useRef<{ pointer: number; x: number; y: number } | null>(null);

	function zoomBy(factor: number) {
		setView((current) => ({
			...current,
			scale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.scale * factor)),
		}));
	}

	function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
		dragRef.current = { pointer: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		setView((current) => ({ ...current, x: event.clientX - drag.x, y: event.clientY - drag.y }));
	}

	function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
		if (dragRef.current?.pointer === event.pointerId) dragRef.current = null;
	}

	function onWheel(event: ReactWheelEvent<HTMLButtonElement>) {
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
	}

	function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		const pan = 60;
		if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
		else if (event.key === "-") zoomBy(1 / ZOOM_STEP);
		else if (event.key === "0") setView(ZOOM_RESET);
		else if (event.key === "ArrowLeft") setView((current) => ({ ...current, x: current.x + pan }));
		else if (event.key === "ArrowRight") setView((current) => ({ ...current, x: current.x - pan }));
		else if (event.key === "ArrowUp") setView((current) => ({ ...current, y: current.y + pan }));
		else if (event.key === "ArrowDown") setView((current) => ({ ...current, y: current.y - pan }));
		else return;
		event.preventDefault();
	}

	return (
		<DialogContent
			className="flex h-[88vh] w-[calc(100%-2rem)] max-w-[min(96vw,80rem)] flex-col gap-0 p-0"
			onOpenAutoFocus={() => setView(ZOOM_RESET)}
		>
			<div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 pr-12">
				<DialogTitle className="label-eyebrow text-foreground">
					{figure === undefined ? "Diagram" : `Fig. ${figure}`}
				</DialogTitle>
				<ButtonGroup aria-label="Zoom" className="ml-auto">
					<ButtonGroupButton onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
						<Minus />
					</ButtonGroupButton>
					<ButtonGroupLabel>{Math.round(view.scale * 100)}%</ButtonGroupLabel>
					<ButtonGroupButton onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
						<Plus />
					</ButtonGroupButton>
					<ButtonGroupButton onClick={() => setView(ZOOM_RESET)} aria-label="Reset view">
						<RotateCcw />
					</ButtonGroupButton>
				</ButtonGroup>
				<Button
					variant="outline"
					size="sm"
					onClick={async () => {
						await navigator.clipboard.writeText(chart);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? <Check /> : <Copy />}
					{copied ? "Copied" : "Copy source"}
				</Button>
			</div>
			<button
				type="button"
				aria-label="Drag to pan, scroll to zoom, arrow keys to move, plus and minus to zoom"
				className="flex-1 cursor-grab overflow-hidden bg-muted/20 active:cursor-grabbing"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onWheel={onWheel}
				onKeyDown={onKeyDown}
			>
				<div
					className="flex h-full w-full items-center justify-center"
					style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
				>
					{lang === "mermaid" ? (
						<MermaidFigure chart={chart} className="[&_svg]:h-auto [&_svg]:w-[68rem] [&_svg]:max-w-none" />
					) : (
						<pre className="p-6 font-mono text-sm">{chart}</pre>
					)}
				</div>
			</button>
			<p className="border-t px-4 py-2 font-mono text-[10px] text-muted-foreground">
				scroll to zoom · drag to pan · esc to close
			</p>
		</DialogContent>
	);
}

function Diagram({ lang, blockKey, children }: { lang: "mermaid" | "d2"; blockKey?: string; children?: ReactNode }) {
	const { figureNumbers } = useContext(PlanRenderContext);
	const chart = reactNodeText(children).trim();
	const figure = blockKey ? figureNumbers[blockKey] : undefined;
	return (
		<figure className="group/diagram">
			<Dialog>
				<DialogTrigger asChild>
					<button
						type="button"
						aria-label={figure === undefined ? "Enlarge diagram" : `Enlarge figure ${figure}`}
						className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-card p-6 outline-none transition-colors hover:border-brand-ink/40 focus-visible:ring-2 focus-visible:ring-ring"
					>
						{lang === "mermaid" ? (
							<MermaidFigure chart={chart} />
						) : (
							<pre className="overflow-x-auto text-left font-mono text-sm">{chart}</pre>
						)}
						<span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/diagram:opacity-100">
							<Maximize2 className="size-3" /> zoom
						</span>
					</button>
				</DialogTrigger>
				<DiagramLightbox chart={chart} figure={figure} lang={lang} />
			</Dialog>
			<figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4">
				{figure !== undefined && <span className="label-eyebrow">Fig. {figure}</span>}
				<details className="min-w-0 flex-1">
					<summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">
						View source
					</summary>
					<div className="[&_pre]:my-2 [&_pre]:text-xs">{children}</div>
				</details>
			</figcaption>
		</figure>
	);
}

function CodeSketch({ lang: _lang, file, children }: { lang: string; file?: string; children?: ReactNode }) {
	return (
		<section className="overflow-hidden rounded-lg border bg-card">
			{file && (
				<header className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2 font-mono text-[11px] text-muted-foreground">
					<span className="size-1.5 rounded-full bg-brand-ink/60" />
					{file}
				</header>
			)}
			<div className="[&_pre]:my-0 [&_pre]:rounded-none [&_pre]:border-0">{children}</div>
		</section>
	);
}

function Callout({ kind, children }: { kind: "note" | "warning"; children?: ReactNode }) {
	const warning = kind === "warning";
	const Icon = warning ? AlertTriangle : Info;
	return (
		<aside
			className={cn(
				"flex gap-3 border-l-2 py-1 pl-4 text-sm leading-6",
				warning ? "border-warning bg-warning/[0.06] py-3 pr-4" : "border-brand-ink/50",
			)}
		>
			<Icon className={cn("mt-1 size-4 shrink-0", warning ? "text-warning" : "text-brand-ink")} />
			<div>{children}</div>
		</aside>
	);
}

function PlanStrong({ node: _node, className, ...props }: ComponentProps<"strong"> & { node?: unknown }) {
	return <strong className={cn("font-semibold text-foreground", className)} {...props} />;
}

function PlanBlockquote({ node: _node, className, ...props }: ComponentProps<"blockquote"> & { node?: unknown }) {
	return (
		<blockquote
			className={cn("border-l-2 pl-4 font-display text-lg text-muted-foreground italic", className)}
			{...props}
		/>
	);
}

/**
 * Tables were unreachable until core learned GFM, so they had never been styled.
 * A comparison is the one task where prose measurably loses, so the table is
 * worth real treatment: a ruled header, breathing room per cell, and its own
 * horizontal scroll so a wide comparison never widens the column.
 */
function PlanTable({ node: _node, className, ...props }: ComponentProps<"table"> & { node?: unknown }) {
	return (
		<div className="-mx-1 my-5 overflow-x-auto rounded-lg border bg-card px-1">
			<table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
		</div>
	);
}

function PlanThead({ node: _node, className, ...props }: ComponentProps<"thead"> & { node?: unknown }) {
	return <thead className={cn("border-b bg-muted/40", className)} {...props} />;
}

function PlanTh({ node: _node, className, ...props }: ComponentProps<"th"> & { node?: unknown }) {
	return (
		<th
			className={cn(
				"px-3 py-2.5 align-bottom font-mono font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.12em]",
				className,
			)}
			{...props}
		/>
	);
}

function PlanTr({ node: _node, className, ...props }: ComponentProps<"tr"> & { node?: unknown }) {
	return <tr className={cn("border-b last:border-b-0", className)} {...props} />;
}

function PlanTd({ node: _node, className, ...props }: ComponentProps<"td"> & { node?: unknown }) {
	return <td className={cn("px-3 py-2.5 align-top leading-6", className)} {...props} />;
}

const planComponents = {
	div: PlanBlock,
	p: PlanParagraph,
	h2: PlanHeading2,
	h3: PlanHeading3,
	ul: PlanList,
	ol: PlanOrderedList,
	li: PlanListItem,
	pre: PlanPre,
	code: PlanCode,
	a: PlanLink,
	input: PlanInput,
	strong: PlanStrong,
	blockquote: PlanBlockquote,
	table: PlanTable,
	thead: PlanThead,
	th: PlanTh,
	tr: PlanTr,
	td: PlanTd,
	TLDR,
	Decision,
	Tradeoff,
	Option,
	Rejected,
	Phase,
	Risk,
	Diagram,
	CodeSketch,
	Callout,
};

export { DetachedCommentThreads, PlanRenderProvider, planComponents };
