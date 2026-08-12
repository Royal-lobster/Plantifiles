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
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, FileDown, History, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
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
};

const NEXT_STATUS_LABEL: Record<Exclude<PlanRouteData["plan"]["status"], "archived" | "in_review">, string> = {
	draft: "Submit for review",
	approved: "Archive",
};

function PlanReader({ data, workspaceSlug, planSlug }: PlanReaderProps) {
	const router = useRouter();
	const [copied, setCopied] = useState(false);
	const [reviewMessage, setReviewMessage] = useState("");
	const [reviewBusy, setReviewBusy] = useState(false);
	const createComment = useServerFn(createCommentForPage);
	const setCommentResolved = useServerFn(setCommentResolvedForPage);
	const resolveDecision = useServerFn(resolveDecisionForPage);
	const approveVersion = useServerFn(approveCurrentVersionForPage);
	const advanceStatus = useServerFn(advancePlanStatusForPage);
	const latest = data.versions[0];
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
	const openDecisions = data.decisions.filter((item) => item.status === "open").length;
	const firstOpenDecision = data.decisions.find((item) => item.status === "open")?.key;
	const canAdvance = Boolean(data.viewer && isCurrentVersion && data.plan.status !== "archived");
	const nextStatusLabel =
		data.plan.status === "archived" || data.plan.status === "in_review"
			? undefined
			: NEXT_STATUS_LABEL[data.plan.status];

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

	// The plan fills the shell, flush with the nav and the plans grid. The shell
	// itself is the reading measure now, so there is no inset column.
	return (
		<section>
			<header className="border-b pb-7">
				{!isCurrentVersion && <p className="label-eyebrow">Historical version</p>}
				<h1 className="mt-1 flex max-w-[34ch] items-start gap-3 font-medium text-3xl leading-[1.15] tracking-tight md:text-4xl">
					{data.plan.emoji && (
						<span aria-hidden className="shrink-0 leading-none">
							{data.plan.emoji}
						</span>
					)}
					<span>{data.plan.title}</span>
				</h1>

				{/* Only what a reviewer acts on: where the plan stands, which version
				    they are reading, and what still blocks it. Author and agent live in
				    version history; the lint score is an authoring metric, not a
				    reading one; and the approval count is already spelled out by the
				    gate sentence below when it blocks. */}
				<div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-muted-foreground text-xs">
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
					<span>{Math.max(1, Math.ceil(data.version.lintReport.readTimeMinutes))} min read</span>
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
				<div className="mt-5 flex flex-wrap items-center gap-2">
					{canAdvance && (
						<Button size="sm" onClick={() => void runStatusAction()} disabled={reviewBusy}>
							{data.plan.status === "in_review"
								? reviewBusy
									? "Approving…"
									: "Approve current version"
								: nextStatusLabel}
							<ArrowRight />
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="icon-sm" aria-label="More plan actions">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuLabel className="label-eyebrow">This plan</DropdownMenuLabel>
							<DropdownMenuItem onSelect={() => void copyMarkdownUrl()}>
								{copied ? <Check /> : <FileDown />}
								{copied ? "Copied Markdown URL" : "Copy Markdown URL"}
							</DropdownMenuItem>
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

			{/* One column, flush with the nav and the title. */}
			<div className="mt-10">
				<article className="relative min-w-0 space-y-7">
					<PlanRenderProvider
						decisions={data.decisions}
						comments={data.comments}
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
				{/* rail removed */}
			</div>

			{/* biome-ignore lint/correctness/useUniqueElementIds: stable fragment target for the overflow menu's jump link */}
			<section className="mt-16 border-t pt-8" id="version-history" aria-label="Version history">
				<header className="flex items-center gap-2">
					<History className="size-4 text-brand-ink" />
					<h2 className="label-eyebrow text-foreground">Version history</h2>
				</header>
				<ol className="mt-5">
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
									{item.changeSummary ?? "Initial version."}
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

export { PlanReader };
