import { Button } from "@plantifiles/ui/components/button";
import { Checkbox } from "@plantifiles/ui/components/checkbox";
import { Textarea } from "@plantifiles/ui/components/textarea";
import { cn } from "@plantifiles/ui/lib/utils";
import {
	AlertTriangle,
	Bot,
	CheckCircle2,
	ChevronRight,
	HelpCircle,
	Info,
	MessageSquare,
	Reply,
	Scale,
	X,
} from "lucide-react";
import {
	type ComponentProps,
	createContext,
	type FormEvent,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

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
type PlanBlockProps = ComponentProps<"div"> & {
	node?: unknown;
	"data-block-kind"?: string;
	"data-block-key"?: string;
};
type PlanRenderContextValue = {
	skim: boolean;
	decisions: ReaderDecision[];
	comments: ReaderComment[];
	changedKeys: Record<string, true>;
	currentBlockKeys: Record<string, true>;
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
	skim: false,
	decisions: [],
	comments: [],
	changedKeys: {},
	currentBlockKeys: {},
	viewerId: null,
	isCurrentVersion: false,
	versionNumberById: {},
	workspaceSlug: "",
	planSlug: "",
});

const SKIM_KIND: Record<string, true> = {
	TLDR: true,
	Decision: true,
	Tradeoff: true,
	Risk: true,
	Diagram: true,
	Phase: true,
};

function PlanRenderProvider({
	children,
	skim,
	decisions,
	comments,
	changedKeys = {},
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
	skim: boolean;
	decisions: ReaderDecision[];
	comments: ReaderComment[];
	changedKeys?: Record<string, true>;
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
	const value = useMemo(
		() => ({
			skim,
			decisions,
			comments,
			changedKeys,
			currentBlockKeys,
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
			skim,
			decisions,
			comments,
			changedKeys,
			currentBlockKeys,
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
	if (context.skim && (!kind || !SKIM_KIND[kind])) return null;
	const threads = context.comments.filter((item) => item.blockKey === key && !item.parentId);
	const canComment = Boolean(
		context.viewerId && context.isCurrentVersion && context.currentBlockKeys[key] && context.onCreateComment,
	);
	return (
		<div
			className={cn(
				"group/plan-block relative scroll-mt-20",
				context.changedKeys[key] && "rounded-lg ring-2 ring-warning/60 ring-offset-4 ring-offset-background",
				className,
			)}
			{...props}
		>
			{canComment && (
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="-left-2 absolute top-0 z-10 size-7 -translate-x-full opacity-100 shadow-sm sm:opacity-0 sm:group-hover/plan-block:opacity-100 sm:focus:opacity-100"
					aria-label={`Comment on ${kind ?? "block"}`}
					onClick={() => setComposing((value) => !value)}
				>
					<MessageSquare className="size-3.5" />
				</Button>
			)}
			{children}
			{(threads.length > 0 || composing) && (
				<div className="mt-3 space-y-3 border-l-2 border-accent/30 pl-3">
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
			<label className="font-medium text-xs" htmlFor={inputId}>
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
		<div className={cn("space-y-2 rounded-md border bg-background p-3", root.resolvedAt && "opacity-70")}>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2 text-xs">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent">
						{root.author.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="truncate font-medium">{root.author.name}</span>
					<time className="text-muted-foreground" dateTime={root.createdAt}>
						{root.createdAt.slice(0, 10)}
					</time>
					{root.agentAssisted && (
						<span className="inline-flex items-center gap-1 text-muted-foreground" title="Agent-assisted comment">
							<Bot className="size-3" /> Agent-assisted
						</span>
					)}
				</div>
				{root.resolvedAt && (
					<span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-mono text-[10px] text-success uppercase">
						<CheckCircle2 className="size-3" /> Resolved
					</span>
				)}
			</div>
			<p className="whitespace-pre-wrap text-sm leading-6">{root.body}</p>
			{replies.map((reply) => (
				<div key={reply.id} className="ml-4 border-l pl-3 text-sm">
					<div className="mb-1 flex items-center gap-2 text-xs">
						<span className="font-medium">{reply.author.name}</span>
						<time className="text-muted-foreground" dateTime={reply.createdAt}>
							{reply.createdAt.slice(0, 10)}
						</time>
						{reply.agentAssisted && <Bot className="size-3 text-muted-foreground" aria-label="Agent-assisted reply" />}
					</div>
					<p className="whitespace-pre-wrap leading-6">{reply.body}</p>
				</div>
			))}
			{error && <p className="text-destructive text-xs">{error}</p>}
			{context.viewerId && context.isCurrentVersion && (
				<div className="flex gap-2">
					{canReply && (
						<Button type="button" variant="ghost" size="sm" onClick={() => setReplying((value) => !value)}>
							<Reply className="size-3.5" /> Reply
						</Button>
					)}
					<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={toggleResolved}>
						<CheckCircle2 className="size-3.5" /> {root.resolvedAt ? "Reopen" : "Resolve"}
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
		<details className="mt-10 rounded-lg border bg-muted/20">
			<summary className="cursor-pointer px-4 py-3 font-medium text-sm">
				From an earlier version ({roots.length})
			</summary>
			<div className="space-y-4 border-t p-4">
				{roots.map((thread) => {
					const version = context.versionNumberById[thread.versionId];
					return (
						<div key={thread.id} className="space-y-2">
							{version && (
								<a
									className="font-mono text-accent text-xs underline underline-offset-4"
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
	return <p className={cn("leading-7 text-foreground/90", className)} {...props} />;
}

function PlanHeading2({ node: _node, className, ...props }: ComponentProps<"h2"> & { node?: unknown }) {
	return <h2 className={cn("mt-10 border-b pb-2 font-semibold text-2xl tracking-tight", className)} {...props} />;
}

function PlanHeading3({ node: _node, className, ...props }: ComponentProps<"h3"> & { node?: unknown }) {
	return <h3 className={cn("mt-8 font-semibold text-xl tracking-tight", className)} {...props} />;
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
	return <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]", className)} {...props} />;
}

function PlanLink({ node: _node, className, ...props }: ComponentProps<"a"> & { node?: unknown }) {
	return <a className={cn("font-medium text-accent underline underline-offset-4", className)} {...props} />;
}

function PlanInput({ node: _node, checked, ...props }: ComponentProps<"input"> & { node?: unknown }) {
	return <Checkbox checked={Boolean(checked)} disabled aria-label={props["aria-label"] ?? "Checklist item"} />;
}

function TLDR({ children }: { children?: ReactNode }) {
	return <div className="text-lg leading-8 [&>p]:text-foreground">{children}</div>;
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
		<section className="rounded-lg border bg-card">
			<header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
				<HelpCircle className="size-4 text-decision" />
				<span className="font-semibold text-sm">Decision</span>
				<span className="ml-auto font-mono text-muted-foreground text-xs">{owner}</span>
				<span
					className={cn(
						"rounded-full px-2 py-0.5 font-mono text-[10px] uppercase",
						status === "resolved" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
					)}
				>
					{status}
				</span>
			</header>
			<div className="px-4 py-4 [&>p]:font-medium">{children}</div>
			{record?.resolution && (
				<footer className="border-t bg-muted/40 px-4 py-3 text-sm">
					<span className="font-medium">Resolution: </span>
					{record.resolution}
				</footer>
			)}
			{canResolve && (
				<div className="border-t px-4 py-3">
					{!resolving ? (
						<Button type="button" size="sm" variant="outline" onClick={() => setResolving(true)}>
							Resolve decision
						</Button>
					) : (
						<form className="space-y-2" onSubmit={submit}>
							<label className="font-medium text-xs" htmlFor={resolutionId}>
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

function Tradeoff({ children }: { children?: ReactNode }) {
	return (
		<section>
			<header className="mb-3 flex items-center gap-2 font-semibold text-sm">
				<Scale className="size-4 text-accent" />
				Tradeoff
			</header>
			<div className="grid gap-3 md:grid-cols-2">{children}</div>
		</section>
	);
}

function Option({ name, recommended, children }: { name: string; recommended?: boolean; children?: ReactNode }) {
	return (
		<section className={cn("rounded-md bg-muted/40 p-4", recommended && "ring-1 ring-accent")}>
			<header className="mb-2 flex items-center gap-2">
				<span className="font-medium">{name}</span>
				{recommended && (
					<span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent uppercase">
						Recommended
					</span>
				)}
			</header>
			<div className="space-y-2 text-sm">{children}</div>
		</section>
	);
}

function Rejected({ what, children }: { what: string; children?: ReactNode }) {
	return (
		<details className="rounded-lg border bg-card">
			<summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-sm">
				<ChevronRight className="size-4 transition-transform [[open]>&]:rotate-90" />
				<X className="size-4 text-destructive" />
				Rejected: {what}
			</summary>
			<div className="border-t px-4 py-3 text-sm">{children}</div>
		</details>
	);
}

function Phase({ n, title, children }: { n: string; title: string; children?: ReactNode }) {
	const { skim } = useContext(PlanRenderContext);
	return (
		<section className="flex gap-4">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono font-semibold text-accent text-sm">
				{n}
			</span>
			<div className="min-w-0 flex-1">
				<h3 className="pt-1 font-semibold">{title}</h3>
				{!skim && <div className="mt-2 [&_li]:flex [&_li]:items-start [&_li]:gap-2 [&_ul]:pl-0">{children}</div>}
			</div>
		</section>
	);
}

function Risk({ severity, children }: { severity: "low" | "med" | "high"; children?: ReactNode }) {
	return (
		<section
			className="rounded-lg border border-l-4 bg-card p-4"
			style={{ borderLeftColor: `var(--risk-${severity})` }}
		>
			<header className="mb-2 flex items-center gap-2 font-semibold text-sm">
				<AlertTriangle className="size-4" style={{ color: `var(--risk-${severity})` }} />
				Risk · <span className="font-mono uppercase">{severity}</span>
			</header>
			<div className="text-sm">{children}</div>
		</section>
	);
}

function reactNodeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(reactNodeText).join("");
	if (isValidElement(node)) return reactNodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
	return "";
}
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

function MermaidFigure({ chart }: { chart: string }) {
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
				const mermaid = (await import("mermaid")).default;
				const styles = getComputedStyle(document.documentElement);
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: "strict",
					theme: "base",
					themeVariables: {
						background: mermaidColor(styles.getPropertyValue("--background").trim()),
						primaryColor: mermaidColor(styles.getPropertyValue("--diagram-node").trim()),
						primaryTextColor: mermaidColor(styles.getPropertyValue("--foreground").trim()),
						lineColor: mermaidColor(styles.getPropertyValue("--diagram-edge").trim()),
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
	return <div ref={rootRef} className="flex justify-center overflow-x-auto p-6" />;
}

function Diagram({ lang, children }: { lang: "mermaid" | "d2"; children?: ReactNode }) {
	const chart = reactNodeText(children).trim();
	return (
		<section className="overflow-hidden rounded-lg border bg-muted/20">
			<div className="min-h-32">
				{lang === "mermaid" ? (
					<MermaidFigure chart={chart} />
				) : (
					<pre className="overflow-x-auto p-6 font-mono text-sm">{chart}</pre>
				)}
			</div>
			<details className="border-t">
				<summary className="cursor-pointer px-4 py-2 font-mono text-muted-foreground text-xs">View source</summary>
				<div className="border-t [&_pre]:my-0 [&_pre]:rounded-none [&_pre]:border-0">{children}</div>
			</details>
		</section>
	);
}

function CodeSketch({ lang: _lang, file, children }: { lang: string; file?: string; children?: ReactNode }) {
	return (
		<section className="overflow-hidden rounded-lg border bg-card">
			{file && <header className="border-b bg-muted px-4 py-2 font-mono text-muted-foreground text-xs">{file}</header>}
			<div className="[&_pre]:my-0 [&_pre]:rounded-none [&_pre]:border-0">{children}</div>
		</section>
	);
}

function Callout({ kind, children }: { kind: "note" | "warning"; children?: ReactNode }) {
	const Icon = kind === "warning" ? AlertTriangle : Info;
	return (
		<aside className="flex gap-3 rounded-md border bg-muted/40 p-4 text-sm">
			<Icon className={cn("mt-1 size-4 shrink-0", kind === "warning" ? "text-warning" : "text-accent")} />
			<div>{children}</div>
		</aside>
	);
}

function PlanStrong({ node: _node, className, ...props }: ComponentProps<"strong"> & { node?: unknown }) {
	return <strong className={cn("font-semibold text-foreground", className)} {...props} />;
}

function PlanBlockquote({ node: _node, className, ...props }: ComponentProps<"blockquote"> & { node?: unknown }) {
	return <blockquote className={cn("border-l-2 pl-4 text-muted-foreground italic", className)} {...props} />;
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
