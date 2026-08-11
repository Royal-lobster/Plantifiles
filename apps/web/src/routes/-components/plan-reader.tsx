import type { BlockChange } from "@plantifiles/core";
import { diff } from "@plantifiles/core/diff";
import { Button } from "@plantifiles/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Clock3, Eye, FileDown, GitCompareArrows, History, ListTree, Pencil } from "lucide-react";
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
	compareFrom?: number | undefined;
};

const CHANGE_CLASS: Record<BlockChange["type"], string> = {
	added: "bg-success/15 text-success",
	removed: "bg-destructive/15 text-destructive",
	modified: "bg-warning/15 text-warning",
	moved: "bg-accent/15 text-accent",
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
	const outline = data.blocks.filter(
		(block) => block.kind === "Heading2" || block.kind === "Heading3" || block.kind === "Decision",
	);
	const openDecisions = data.decisions.filter((item) => item.status === "open").length;
	const currentApprovals = isCurrentVersion ? data.approvals.length : 0;

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
		<section className="space-y-10">
			<header className="space-y-5 border-b pb-6">
				<div className="flex flex-wrap items-center gap-2">
					<StatusChip status={data.plan.status} />
					<Select value={String(data.version.number)} onValueChange={(value) => void selectVersion(value)}>
						<SelectTrigger className="h-8 w-24 font-mono text-xs" aria-label="Plan version">
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
					<span className="rounded-full bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
						lint {data.version.lintReport.score}
					</span>
					<span className="rounded-full bg-warning/15 px-2 py-1 font-mono text-warning text-xs">
						{openDecisions} open
					</span>
					<span className="flex items-center gap-1 text-muted-foreground text-xs">
						<Clock3 className="size-3.5" />
						{Math.max(1, Math.ceil(data.version.lintReport.readTimeMinutes))} min
					</span>
					<span className="rounded-full bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
						{currentApprovals}/{data.workspace.requiredApprovals} approvals
					</span>
				</div>
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
					<div>
						<p className="font-mono text-accent text-xs uppercase tracking-widest">{data.workspace.name} / Plan</p>
						<h1 className="mt-2 font-semibold text-3xl tracking-tight">{data.plan.title}</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							{data.version.number === latest?.number ? "Current" : "Historical"} version by {data.author.name}
							{data.version.agentName ? ` via ${data.version.agentName}` : " by hand"}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant={skim ? "default" : "outline"} onClick={() => setSkim((value) => !value)}>
							<Eye /> {skim ? "Full document" : "Skim"}
						</Button>
						<Button
							variant="outline"
							onClick={() => setShowDiff((value) => !value)}
							disabled={data.versions.length < 2}
						>
							<GitCompareArrows /> Diff
						</Button>
						<Button
							variant="outline"
							onClick={async () => {
								const url = `${window.location.origin}/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}?format=md`;
								await navigator.clipboard.writeText(url);
								setCopied(true);
							}}
						>
							<FileDown />
							{copied ? (
								<>
									<Check /> Copied
								</>
							) : (
								"Copy Markdown URL"
							)}
						</Button>
						{data.viewer && isCurrentVersion && (
							<Button variant="outline" asChild>
								<Link to="/p/$workspaceSlug/$planSlug/edit" params={{ workspaceSlug, planSlug }}>
									<Pencil /> Edit
								</Link>
							</Button>
						)}
						{data.viewer && isCurrentVersion && data.plan.status !== "archived" && (
							<Button onClick={() => void runStatusAction()} disabled={reviewBusy}>
								{data.plan.status === "in_review"
									? reviewBusy
										? "Approving…"
										: "Approve current version"
									: NEXT_STATUS_LABEL[data.plan.status]}
								<ArrowRight />
							</Button>
						)}
					</div>
				</div>
				{reviewMessage && (
					<p className={cn("text-sm", reviewMessage.includes("block") ? "text-warning" : "text-muted-foreground")}>
						{reviewMessage}
					</p>
				)}
			</header>

			{showDiff && structuralDiff && fromVersion && toVersion && (
				<section className="space-y-4 rounded-lg border bg-card p-5" aria-label="Structural diff">
					<div className="flex flex-wrap items-center gap-3">
						<GitCompareArrows className="size-4 text-accent" />
						<h2 className="font-semibold">Structural diff</h2>
						<Select value={fromNumber} onValueChange={setFromNumber}>
							<SelectTrigger className="h-8 w-24" aria-label="From version">
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
						<span className="text-muted-foreground text-sm">to</span>
						<Select value={toNumber} onValueChange={setToNumber}>
							<SelectTrigger className="h-8 w-24" aria-label="To version">
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
					<p className="text-sm">{structuralDiff.summary || "No structural changes."}</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{structuralDiff.changes.map((change) => (
							<div key={`${change.type}-${change.key}`} className="rounded-md border p-3">
								<span
									className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${CHANGE_CLASS[change.type]}`}
								>
									{change.type}
								</span>
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

			<details className="rounded-lg border p-3 xl:hidden">
				<summary className="flex cursor-pointer items-center gap-2 font-medium text-sm">
					<ListTree className="size-4" />
					Document outline
				</summary>
				<Outline blocks={outline} />
			</details>
			<div className="xl:grid xl:grid-cols-[minmax(0,68ch)_14rem] xl:items-start xl:gap-12">
				<article className="min-w-0 space-y-6">
					<PlanRenderProvider
						skim={skim}
						decisions={data.decisions}
						comments={data.comments}
						changedKeys={changedKeys}
						currentBlockKeys={currentBlockKeys}
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
					<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">Outline</p>
					<Outline blocks={outline} />
				</aside>
			</div>

			<section className="space-y-4 border-t pt-8" aria-label="Version history">
				<header className="flex items-center gap-2">
					<History className="size-4 text-accent" />
					<h2 className="font-semibold text-lg">Version history</h2>
				</header>
				<div className="space-y-2">
					{data.versions.map((item) => (
						<article key={item.id} className="rounded-lg border bg-card p-4">
							<div className="flex flex-wrap items-center gap-2">
								<Button variant="ghost" size="sm" asChild>
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
									>
										v{item.number}
									</Link>
								</Button>
								<span className="text-sm">{item.author.name}</span>
								{item.agentName && (
									<span className="font-mono text-muted-foreground text-xs">via {item.agentName}</span>
								)}
								<time className="ml-auto text-muted-foreground text-xs">{formatUtcTimestamp(item.createdAt)}</time>
							</div>
							<p className="mt-2 text-muted-foreground text-sm">
								{item.changeSummaryProse ?? item.changeSummary ?? "Initial version."}
							</p>
							{item.agentPrompt && (
								<details className="mt-2">
									<summary className="cursor-pointer font-mono text-accent text-xs">Agent prompt</summary>
									<pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">
										{item.agentPrompt}
									</pre>
								</details>
							)}
						</article>
					))}
				</div>
			</section>
		</section>
	);
}

function Outline({ blocks }: { blocks: PlanRouteData["blocks"] }) {
	return (
		<nav className="mt-3 space-y-1" aria-label="Document outline links">
			{blocks.map((block) => (
				<a
					key={block.key}
					href={`#${encodeURIComponent(block.key)}`}
					className={`block truncate rounded px-2 py-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground ${block.kind === "Heading3" ? "ml-3" : ""}`}
				>
					{block.title ?? outlineLabel(block.source)}
				</a>
			))}
		</nav>
	);
}

export { PlanReader };
