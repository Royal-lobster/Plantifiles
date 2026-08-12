import type { BlockChange } from "@plantifiles/core";
import { diff } from "@plantifiles/core/diff";
import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@plantifiles/ui/components/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@plantifiles/ui/components/toggle-group";
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	ArrowRight,
	Check,
	Eye,
	FileDown,
	GitCompareArrows,
	History,
	ListTree,
	MoreHorizontal,
	Pencil,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUtcTimestamp } from "#/lib/format-time";
import type { PlanRouteData } from "#/lib/plan-data";
import { renderPlan } from "#/lib/render-plan";
import {
	advancePlanStatusForPage,
	approveCurrentVersionForPage,
	createCommentForPage,
	resolveDecisionForPage,
	setCommentResolvedForPage,
} from "#/lib/review-data";
import { DetachedCommentThreads, PlanRenderProvider } from "./plan-components";
import { StatusChip } from "./status-chip";

type PlanReaderProps = {
	data: PlanRouteData;
	workspaceSlug: string;
	planSlug: string;
	compareFrom?: number | undefined;
};

type ChangeBadgeVariant = "success" | "destructive" | "warning" | "secondary";

const CHANGE_VARIANT: Record<BlockChange["type"], ChangeBadgeVariant> = {
	added: "success",
	removed: "destructive",
	modified: "warning",
	moved: "secondary",
};

const NEXT_STATUS_LABEL: Record<Exclude<PlanRouteData["plan"]["status"], "archived" | "in_review">, string> = {
	draft: "Submit for review",
	approved: "Start building",
	building: "Mark shipped",
	shipped: "Archive",
};

function outlineLabel(source: string): string {
	return source
		.replace(/^#{1,3}\s*/, "")
		.replace(/<[^>]+>/g, "")
		.trim()
		.slice(0, 80);
}

/** Marks the outline entry the reader is currently inside, so a long document has a position. */
function useActiveBlockKey(keys: string[]): string | undefined {
	const [active, setActive] = useState<string>();
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const first = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (first) setActive(first.target.id);
			},
			{ rootMargin: "-72px 0px -65% 0px" },
		);
		for (const key of keys) {
			const element = document.getElementById(key);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, [keys]);
	return active;
}

function PlanReader({ data, workspaceSlug, planSlug, compareFrom }: PlanReaderProps) {
	const router = useRouter();
	const [skim, setSkim] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showDiff, setShowDiff] = useState(compareFrom !== undefined);
	const [reviewMessage, setReviewMessage] = useState("");
	const [reviewBusy, setReviewBusy] = useState(false);
	const createComment = useServerFn(createCommentForPage);
	const setCommentResolved = useServerFn(setCommentResolvedForPage);
	const resolveDecision = useServerFn(resolveDecisionForPage);
	const approveVersion = useServerFn(approveCurrentVersionForPage);
	const advanceStatus = useServerFn(advancePlanStatusForPage);
	const latest = data.versions[0];
	const oldest = data.versions.at(-1);
	const [fromNumber, setFromNumber] = useState(
		String(
			data.versions.some((item) => item.number === compareFrom) ? compareFrom : (oldest?.number ?? data.version.number),
		),
	);
	const [toNumber, setToNumber] = useState(String(latest?.number ?? data.version.number));
	const fromVersion = data.versions.find((item) => item.number === Number(fromNumber));
	const toVersion = data.versions.find((item) => item.number === Number(toNumber));
	const comparable = data.versions.length > 1;
	const structuralDiff = useMemo(
		() => (fromVersion && toVersion ? diff(fromVersion.blocks, toVersion.blocks) : undefined),
		[fromVersion, toVersion],
	);
	const changedKeys = useMemo(() => {
		if (!showDiff || toVersion?.number !== data.version.number || !structuralDiff) return {};
		return Object.fromEntries(
			structuralDiff.changes
				.filter((change) => change.type !== "removed")
				.map((change) => [change.next?.key ?? change.key, true]),
		) as Record<string, true>;
	}, [data.version.number, showDiff, structuralDiff, toVersion]);
	const isCurrentVersion = data.version.number === latest?.number;
	const currentBlockKeys = useMemo(
		() => Object.fromEntries((latest?.blocks ?? []).map((block) => [block.key, true])) as Record<string, true>,
		[latest],
	);
	const versionNumberById = useMemo(
		() => Object.fromEntries(data.versions.map((version) => [version.id, version.number])),
		[data.versions],
	);
	const rendered = useMemo(() => renderPlan(data.renderTree), [data.renderTree]);
	const outline = useMemo(
		() =>
			data.blocks.filter(
				(block) => block.kind === "Heading2" || block.kind === "Heading3" || block.kind === "Decision",
			),
		[data.blocks],
	);
	const outlineKeys = useMemo(() => outline.map((block) => block.key), [outline]);
	const activeKey = useActiveBlockKey(outlineKeys);
	const openDecisions = data.decisions.filter((item) => item.status === "open").length;
	const firstOpenDecision = data.decisions.find((item) => item.status === "open")?.key;
	const currentApprovals = isCurrentVersion ? data.approvals.length : 0;
	const canEdit = Boolean(data.viewer && isCurrentVersion);
	const canAdvance = Boolean(data.viewer && isCurrentVersion && data.plan.status !== "archived");
	const nextStatusLabel =
		data.plan.status === "archived" || data.plan.status === "in_review"
			? undefined
			: NEXT_STATUS_LABEL[data.plan.status];
	const readingModes = [...(skim ? ["skim"] : []), ...(showDiff ? ["diff"] : [])];

	async function refreshReview(resultMessage: string) {
		setReviewMessage(resultMessage);
		await router.invalidate();
	}

	async function runStatusAction() {
		setReviewBusy(true);
		setReviewMessage("");
		try {
			const result =
				data.plan.status === "in_review"
					? await approveVersion({ data: { planId: data.plan.id } })
					: await advanceStatus({ data: { planId: data.plan.id } });
			await refreshReview(result.reason ?? `Plan is now ${result.status.replace("_", " ")}.`);
		} catch (caught) {
			setReviewMessage(caught instanceof Error ? caught.message : "Could not update plan status.");
		} finally {
			setReviewBusy(false);
		}
	}

	async function copyMarkdownUrl() {
		const url = `${window.location.origin}/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}?format=md`;
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	async function selectVersion(value: string) {
		const number = Number(value);
		if (number === latest?.number) {
			await router.navigate({ to: "/p/$workspaceSlug/$planSlug", params: { workspaceSlug, planSlug } });
			return;
		}
		await router.navigate({
			to: "/p/$workspaceSlug/$planSlug/v/$number",
			params: { workspaceSlug, planSlug, number: value },
		});
	}

	return (
		<section>
			<header className="border-b pb-7">
				<p className="label-eyebrow">
					{data.workspace.name}
					{isCurrentVersion ? "" : " · historical version"}
				</p>
				<h1 className="mt-3 max-w-[34ch] font-display font-medium text-4xl leading-[1.1] tracking-tight md:text-[3.25rem]">
					{data.plan.title}
				</h1>

				{/* One credit line carries the metadata that used to be six chips. */}
				<div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-muted-foreground text-xs">
					<StatusChip status={data.plan.status} size="sm" />
					{data.versions.length > 1 ? (
						<Select value={String(data.version.number)} onValueChange={(value) => void selectVersion(value)}>
							<SelectTrigger
								className="h-6 gap-1 rounded-sm border-0 bg-muted px-2 font-mono text-xs shadow-none focus-visible:ring-1"
								aria-label="Plan version"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{data.versions.map((item) => (
									<SelectItem key={item.id} value={String(item.number)}>
										v{item.number}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<span className="rounded-sm bg-muted px-2 py-0.5">v{data.version.number}</span>
					)}
					<span>
						{data.author.name}
						{data.version.agentName ? ` via ${data.version.agentName}` : " by hand"}
					</span>
					<span className="text-border">·</span>
					<span>{Math.max(1, Math.ceil(data.version.lintReport.readTimeMinutes))} min read</span>
					<span className="text-border">·</span>
					<span title="Lint score">lint {data.version.lintReport.score}</span>
					<span className="text-border">·</span>
					<span className={currentApprovals >= data.workspace.requiredApprovals ? "text-success" : undefined}>
						{currentApprovals}/{data.workspace.requiredApprovals} approvals
					</span>
					{openDecisions > 0 && (
						<>
							<span className="text-border">·</span>
							<a href={`#${encodeURIComponent(firstOpenDecision ?? "")}`} className="text-warning hover:underline">
								{openDecisions} open {openDecisions === 1 ? "decision" : "decisions"}
							</a>
						</>
					)}
				</div>

				{/* One primary action, related reading modes segmented, everything else
				    behind the overflow. A control that cannot act is not rendered. */}
				<div className="mt-6 flex flex-wrap items-center gap-2">
					{canAdvance && (
						<Button onClick={() => void runStatusAction()} disabled={reviewBusy}>
							{data.plan.status === "in_review"
								? reviewBusy
									? "Approving…"
									: "Approve current version"
								: nextStatusLabel}
							<ArrowRight />
						</Button>
					)}
					<ToggleGroup
						type="multiple"
						value={readingModes}
						onValueChange={(value: string[]) => {
							setSkim(value.includes("skim"));
							setShowDiff(comparable && value.includes("diff"));
						}}
						aria-label="Reading mode"
					>
						<ToggleGroupItem value="skim" aria-label="Skim mode">
							<Eye /> Skim
						</ToggleGroupItem>
						{comparable && (
							<ToggleGroupItem value="diff" aria-label="Compare versions">
								<GitCompareArrows /> Diff
							</ToggleGroupItem>
						)}
					</ToggleGroup>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="icon" aria-label="More plan actions">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel className="label-eyebrow">This plan</DropdownMenuLabel>
							<DropdownMenuItem onSelect={() => void copyMarkdownUrl()}>
								{copied ? <Check /> : <FileDown />}
								{copied ? "Copied Markdown URL" : "Copy Markdown URL"}
							</DropdownMenuItem>
							{canEdit && (
								<DropdownMenuItem asChild>
									<Link to="/p/$workspaceSlug/$planSlug/edit" params={{ workspaceSlug, planSlug }}>
										<Pencil /> Edit source
									</Link>
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild>
								<a href="#version-history">
									<History /> Version history
								</a>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				{reviewMessage && (
					<p className={cn("mt-4 text-sm", reviewMessage.includes("block") ? "text-warning" : "text-muted-foreground")}>
						{reviewMessage}
					</p>
				)}
			</header>

			{showDiff && structuralDiff && fromVersion && toVersion && (
				<section className="mt-8 rounded-lg border bg-card p-5" aria-label="Structural diff">
					<div className="flex flex-wrap items-center gap-3">
						<GitCompareArrows className="size-4 text-brand-ink" />
						<h2 className="label-eyebrow text-foreground">Structural diff</h2>
						<div className="ml-auto flex items-center gap-2">
							<Select value={fromNumber} onValueChange={setFromNumber}>
								<SelectTrigger className="h-8 w-20 font-mono text-xs" aria-label="From version">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{data.versions.map((item) => (
										<SelectItem key={item.id} value={String(item.number)}>
											v{item.number}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-muted-foreground text-xs">to</span>
							<Select value={toNumber} onValueChange={setToNumber}>
								<SelectTrigger className="h-8 w-20 font-mono text-xs" aria-label="To version">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{data.versions.map((item) => (
										<SelectItem key={item.id} value={String(item.number)}>
											v{item.number}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<p className="mt-3 text-sm">{structuralDiff.summary || "No structural changes."}</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{structuralDiff.changes.map((change) => (
							<div key={`${change.type}-${change.key}`} className="rounded-md border p-3">
								<Badge variant={CHANGE_VARIANT[change.type]} size="sm">
									{change.type}
								</Badge>
								<p className="mt-2 font-medium text-sm">
									{change.next?.title ?? change.previous?.title ?? change.kind}
								</p>
								<pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-muted-foreground text-xs">
									{change.next?.source ?? change.previous?.source}
								</pre>
							</div>
						))}
					</div>
				</section>
			)}

			<details className="mt-8 rounded-lg border p-3 xl:hidden">
				<summary className="flex cursor-pointer items-center gap-2 font-medium text-sm">
					<ListTree className="size-4" />
					Document outline
				</summary>
				<Outline blocks={outline} activeKey={activeKey} />
			</details>

			<div className="mt-10 xl:grid xl:grid-cols-[var(--container-gutter)_minmax(0,var(--container-measure))_var(--container-rail)] xl:gap-x-8 2xl:gap-x-12">
				{/* The gutter track is empty on purpose: each block swings its own
				    marginalia into it, which keeps remarks beside their subject. */}
				<div aria-hidden className="hidden xl:block" />
				<article className="relative mx-auto min-w-0 max-w-measure space-y-7 xl:mx-0">
					<PlanRenderProvider
						skim={skim}
						decisions={data.decisions}
						comments={data.comments}
						changedKeys={changedKeys}
						currentBlockKeys={currentBlockKeys}
						blocks={data.blocks}
						viewerId={data.viewer?.id ?? null}
						isCurrentVersion={isCurrentVersion}
						versionNumberById={versionNumberById}
						workspaceSlug={workspaceSlug}
						planSlug={planSlug}
						onCreateComment={async (value) => {
							await createComment({ data: { planId: data.plan.id, ...value } });
							await refreshReview("Comment added.");
						}}
						onResolveComment={async (commentId, resolved) => {
							await setCommentResolved({ data: { commentId, resolved } });
							await refreshReview(resolved ? "Comment resolved." : "Comment reopened.");
						}}
						onResolveDecision={async (key, resolution) => {
							const result = await resolveDecision({ data: { planId: data.plan.id, key, resolution } });
							await refreshReview(result.reason ?? "Decision resolved.");
							return { ...result, reason: null };
						}}
					>
						{rendered}
						<DetachedCommentThreads />
					</PlanRenderProvider>
				</article>
				<aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto xl:block">
					<p className="label-eyebrow">Outline</p>
					<Outline blocks={outline} activeKey={activeKey} />
				</aside>
			</div>

			{/* biome-ignore lint/correctness/useUniqueElementIds: stable fragment target for the overflow menu's jump link */}
			<section className="mt-16 border-t pt-8" id="version-history" aria-label="Version history">
				<header className="flex items-center gap-2">
					<History className="size-4 text-brand-ink" />
					<h2 className="label-eyebrow text-foreground">Version history</h2>
				</header>
				<ol className="mt-5 max-w-measure">
					{data.versions.map((item, index) => (
						<li key={item.id} className="relative pl-10">
							{index < data.versions.length - 1 && (
								<span aria-hidden className="absolute top-7 bottom-0 left-[0.6875rem] w-px bg-border" />
							)}
							<span className="absolute top-0.5 left-0 flex h-6 items-center rounded-sm bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
								v{item.number}
							</span>
							<div className="pb-7">
								<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
									<Link
										to={
											item.number === latest?.number
												? "/p/$workspaceSlug/$planSlug"
												: "/p/$workspaceSlug/$planSlug/v/$number"
										}
										params={
											item.number === latest?.number
												? { workspaceSlug, planSlug }
												: { workspaceSlug, planSlug, number: String(item.number) }
										}
										className={cn(
											"font-medium text-sm hover:text-brand-ink hover:underline",
											item.number === data.version.number && "text-brand-ink",
										)}
									>
										{item.author.name}
									</Link>
									{item.agentName && (
										<span className="font-mono text-muted-foreground text-xs">via {item.agentName}</span>
									)}
									<time className="ml-auto font-mono text-muted-foreground text-xs">
										{formatUtcTimestamp(item.createdAt)}
									</time>
								</div>
								<p className="mt-1.5 text-muted-foreground text-sm leading-6">
									{item.changeSummaryProse ?? item.changeSummary ?? "Initial version."}
								</p>
								{item.agentPrompt && (
									<details className="mt-2">
										<summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">
											Agent prompt
										</summary>
										<pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-6">
											{item.agentPrompt}
										</pre>
									</details>
								)}
							</div>
						</li>
					))}
				</ol>
			</section>
		</section>
	);
}

function Outline({ blocks, activeKey }: { blocks: PlanRouteData["blocks"]; activeKey: string | undefined }) {
	return (
		<nav className="mt-3 space-y-0.5" aria-label="Document outline links">
			{blocks.map((block) => (
				<a
					key={block.key}
					href={`#${encodeURIComponent(block.key)}`}
					className={cn(
						"flex items-center gap-2 truncate rounded-sm py-1 text-xs transition-colors",
						block.kind === "Heading3" && "pl-3",
						block.kind === "Decision" && "pl-3 font-mono text-[11px]",
						activeKey === block.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
					)}
				>
					{activeKey === block.key && <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-brand-ink" />}
					<span className="truncate">{block.title ?? outlineLabel(block.source)}</span>
				</a>
			))}
		</nav>
	);
}

export { PlanReader };
