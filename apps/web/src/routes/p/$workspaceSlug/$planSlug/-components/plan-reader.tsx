import { Button } from "@plantifiles/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusChip } from "#/components/status-chip";
import { formatUtcTimestamp } from "#/lib/helpers/format-time";
import { renderPlan } from "#/routes/p/$workspaceSlug/$planSlug/-components/plan-render";
import type { PlanReaderData } from "#/routes/p/$workspaceSlug/$planSlug/-data/plan-reader";
import { GuidedPlanDocument } from "./guided-plan-document";
import { PlanActionsMenu } from "./plan-actions-menu";
import { PlanReviewDocument } from "./plan-review-document";
import { PlanStatusAction } from "./plan-status-action";

type PlanReaderProps = {
	data: PlanReaderData;
};

function PlanReader({ data }: PlanReaderProps) {
	const workspaceSlug = data.workspace.slug;
	const planSlug = data.plan.slug;
	const router = useRouter();
	const latest = data.versions[0];
	const isCurrentVersion = data.version.number === latest?.number;
	const renderedDocument = useMemo(() => renderPlan(data.renderTree), [data.renderTree]);
	const supportsGuided = data.metadata.profile === "lesson" || data.metadata.profile === "guided-plan";
	const [readerMode, setReaderMode] = useState<"document" | "guided">(supportsGuided ? "guided" : "document");
	const openDecisions = data.decisions.filter((item) => item.status === "open").length;
	const firstOpenDecision = data.decisions.find((item) => item.status === "open")?.key;

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
		<article aria-label={data.plan.title} className="w-full">
			<header className="border-b border-foreground/[0.08] pb-8">
				{!isCurrentVersion && <p className="label-eyebrow">Historical version</p>}
				<h1 className="mt-1 flex max-w-[34ch] items-start gap-3 font-medium text-3xl leading-[1.15] tracking-tight md:text-4xl">
					{data.plan.emoji && (
						<span aria-hidden className="shrink-0 leading-none">
							{data.plan.emoji}
						</span>
					)}
					<span>{data.plan.title}</span>
				</h1>

				{/* Status and actions share one rail below the title. This keeps long
				    titles from pushing the actions onto a separate header row. */}
				<div className="mt-4 flex flex-wrap items-center gap-3">
					{/* Only what a reviewer acts on: where the plan stands, which version
					    they are reading, and what still blocks it. Author and agent live in
					    version history; the lint score is an authoring metric, not a
					    reading one; and the approval count is already spelled out by the
					    gate sentence below when it blocks. */}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-muted-foreground text-xs">
						<StatusChip status={data.plan.status} />
						{data.versions.length > 1 ? (
							<Select value={String(data.version.number)} onValueChange={(value) => void selectVersion(value)}>
								<SelectTrigger
									className="h-6 gap-1 bg-muted px-2.5 font-mono text-xs shadow-none"
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
							<span className="rounded-full bg-muted px-2.5 py-0.5">v{data.version.number}</span>
						)}
						<span>{Math.max(1, Math.ceil(data.version.lintReport.readTimeMinutes))} min read</span>
						{openDecisions > 0 && (
							<>
								{/* The meta row wraps on narrow viewports, so the separator only
								    exists at widths where it stays between two items. */}
								<span aria-hidden="true" className="hidden text-border sm:inline">
									·
								</span>
								<a href={`#${encodeURIComponent(firstOpenDecision ?? "")}`} className="text-warning hover:underline">
									{openDecisions} open {openDecisions === 1 ? "decision" : "decisions"}
								</a>
							</>
						)}
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-2">
						<PlanStatusAction data={data} isCurrentVersion={isCurrentVersion} />
						<PlanActionsMenu />
					</div>
				</div>
			</header>

			{supportsGuided && (
				<fieldset className="mt-5 flex items-center gap-2 border-0 p-0">
					<legend className="sr-only">Reader view</legend>
					<Button
						type="button"
						size="sm"
						variant={readerMode === "guided" ? "default" : "outline"}
						aria-pressed={readerMode === "guided"}
						onClick={() => setReaderMode("guided")}
					>
						Guided
					</Button>
					<Button
						type="button"
						size="sm"
						variant={readerMode === "document" ? "default" : "outline"}
						aria-pressed={readerMode === "document"}
						onClick={() => setReaderMode("document")}
					>
						Document
					</Button>
				</fieldset>
			)}

			{/* One column, flush with the nav and the title. */}
			<PlanReviewDocument data={data} isCurrentVersion={isCurrentVersion}>
				{readerMode === "guided" && supportsGuided ? <GuidedPlanDocument data={data} /> : renderedDocument}
			</PlanReviewDocument>

			{/* biome-ignore lint/correctness/useUniqueElementIds: stable fragment target for the overflow menu's jump link */}
			<section
				className="mt-16 border-t border-foreground/[0.08] pt-10"
				id="version-history"
				aria-label="Version history"
			>
				<header className="flex items-center gap-2">
					<History className="size-4 text-brand-ink" />
					<h2 className="label-eyebrow text-foreground">Version history</h2>
				</header>
				<ol className="mt-6">
					{data.versions.map((item, index) => (
						<li key={item.id} className="relative pb-6 pl-10">
							{index < data.versions.length - 1 && (
								<span aria-hidden className="absolute top-12 bottom-0 left-[0.6875rem] w-px bg-border" />
							)}
							<span className="absolute top-5 left-0 flex h-6 items-center rounded-full bg-muted px-2 font-mono text-[11px] text-muted-foreground">
								v{item.number}
							</span>
							<div className="surface-card p-5">
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
										<pre className="surface-inset mt-3 whitespace-pre-wrap p-5 font-mono text-xs leading-6">
											{item.agentPrompt}
										</pre>
									</details>
								)}
							</div>
						</li>
					))}
				</ol>
			</section>
		</article>
	);
}

export { PlanReader };
