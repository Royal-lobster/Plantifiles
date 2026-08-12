import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { type DashboardPlan, getDashboardData, type PlanStatus } from "#/lib/app-data";
import { guardLoader } from "#/lib/loader-guard";
import { StatusChip } from "./-components/status-chip";

const dashboardSearchSchema = z.object({
	status: z.enum(["draft", "in_review", "approved", "archived"]).optional(),
	q: z.string().optional(),
});

export const Route = createFileRoute("/w/$slug/")({
	validateSearch: dashboardSearchSchema,
	loader: ({ params }) => guardLoader(() => getDashboardData({ data: params })),
	component: Dashboard,
	pendingComponent: DashboardSkeleton,
});

const STATUS_ORDER: PlanStatus[] = ["draft", "in_review", "approved", "archived"];

function relativeTime(value: string): string {
	const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

type PlanGroup = { label: string; urgent?: boolean; plans: DashboardPlan[] };

/**
 * The dashboard is an index of the team's thinking, so it groups by what a
 * reader has to do about a plan rather than laying eight equal-weight columns
 * side by side. An unresolved decision outranks every status.
 */
function groupPlans(plans: DashboardPlan[]): PlanGroup[] {
	const blocked: DashboardPlan[] = [];
	const byStatus: Record<PlanStatus, DashboardPlan[]> = {
		draft: [],
		in_review: [],
		approved: [],
		archived: [],
	};
	for (const item of plans) {
		if (item.openDecisions > 0 && item.status !== "archived") blocked.push(item);
		else byStatus[item.status].push(item);
	}
	return [
		{ label: "Awaiting judgment", urgent: true, plans: blocked },
		{ label: "In review", plans: byStatus.in_review },
		{ label: "Moving", plans: byStatus.approved },
		{ label: "Drafts", plans: byStatus.draft },
		{ label: "Closed", plans: byStatus.archived },
	].filter((group) => group.plans.length > 0);
}

function Dashboard() {
	const { plans } = Route.useLoaderData();
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const visiblePlans = useMemo(
		() =>
			plans.filter(
				(plan) =>
					(!search.status || plan.status === search.status) &&
					(!search.q || plan.title.toLowerCase().includes(search.q.toLowerCase())),
			),
		[plans, search.q, search.status],
	);
	const groups = useMemo(
		() =>
			search.status ? [{ label: search.status.replace("_", " "), plans: visiblePlans }] : groupPlans(visiblePlans),
		[search.status, visiblePlans],
	);
	const openDecisions = plans.reduce((total, item) => total + item.openDecisions, 0);

	return (
		<section>
			<header className="border-b pb-6">
				<h1 className="font-medium text-2xl tracking-tight">Plans</h1>
				<p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-muted-foreground text-xs">
					<span>
						{plans.length} {plans.length === 1 ? "plan" : "plans"}
					</span>
					<span className="text-border">·</span>
					<span className={openDecisions > 0 ? "text-warning" : undefined}>{openDecisions} open decisions</span>
					<span className="text-border">·</span>
					<span>{plans.filter((item) => item.status === "in_review").length} in review</span>
				</p>
			</header>

			{plans.length === 0 ? (
				<EmptyState slug={slug} />
			) : (
				<>
					<div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center">
						<div className="relative flex-1 sm:max-w-xs">
							<Search className="absolute top-2.5 left-0 size-4 text-muted-foreground" />
							<Input
								aria-label="Filter by title"
								className="h-9 rounded-none border-0 border-b bg-transparent pl-6 shadow-none focus-visible:border-brand-ink focus-visible:ring-0"
								value={search.q ?? ""}
								onChange={(event) =>
									void navigate({ search: (previous) => ({ ...previous, q: event.target.value || undefined }) })
								}
								placeholder="Filter titles"
							/>
						</div>
						<Select
							value={search.status ?? "all"}
							onValueChange={(value) =>
								void navigate({
									search: (previous) => ({
										...previous,
										status: value === "all" ? undefined : (value as PlanStatus),
									}),
								})
							}
						>
							<SelectTrigger className="h-9 w-44 sm:ml-auto" aria-label="Filter by status">
								<SelectValue placeholder="All statuses" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								{STATUS_ORDER.map((status) => (
									<SelectItem key={status} value={status}>
										{status.replace("_", " ")}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{groups.length === 0 ? (
						<p className="py-16 text-center text-muted-foreground text-sm">No plans match these filters.</p>
					) : (
						groups.map((group) => (
							<section key={group.label} className="mt-10 first:mt-2">
								<div className="flex items-center gap-3">
									<span className={group.urgent ? "label-eyebrow text-warning" : "label-eyebrow"}>{group.label}</span>
									<span className="font-mono text-[11px] text-muted-foreground/60">{group.plans.length}</span>
									<span className="h-px flex-1 bg-border" />
								</div>
								<ul>
									{group.plans.map((plan) => (
										<li key={plan.id}>
											<PlanEntry plan={plan} workspaceSlug={slug} />
										</li>
									))}
								</ul>
							</section>
						))
					)}
				</>
			)}
		</section>
	);
}

function PlanEntry({ plan, workspaceSlug }: { plan: DashboardPlan; workspaceSlug: string }) {
	const readTime = Math.max(1, Math.ceil(plan.readTimeMinutes));
	const approved = plan.approvals >= plan.requiredApprovals;
	return (
		<Link
			to="/p/$workspaceSlug/$planSlug"
			params={{ workspaceSlug, planSlug: plan.slug }}
			className="group -mx-3 flex flex-col gap-3 border-b px-3 py-5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-6"
		>
			<div className="min-w-0 flex-1">
				<h3 className="font-display font-medium text-lg leading-snug tracking-tight transition-colors group-hover:text-brand-ink sm:text-xl">
					{plan.title}
				</h3>
				<p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
					<StatusChip status={plan.status} size="sm" />
					<span>v{plan.version}</span>
					<span className="text-border">·</span>
					<span>{readTime} min read</span>
					<span className="text-border">·</span>
					<span className="truncate">
						{plan.authorName}
						{plan.agentName ? ` via ${plan.agentName}` : " by hand"}
					</span>
					<span className="text-border">·</span>
					<time dateTime={plan.updatedAt}>{relativeTime(plan.updatedAt)}</time>
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-4">
				{plan.openDecisions > 0 ? (
					<Badge variant="warning" size="sm">
						{plan.openDecisions} open
					</Badge>
				) : (
					<span className="w-16 font-mono text-[11px] text-muted-foreground/50 sm:text-right">resolved</span>
				)}
				<span
					className={`w-10 text-right font-mono text-xs tabular-nums ${approved ? "text-success" : "text-muted-foreground"}`}
					title={`${plan.approvals} of ${plan.requiredApprovals} approvals`}
				>
					{plan.approvals}/{plan.requiredApprovals}
				</span>
				<ArrowUpRight className="size-4 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-brand-ink" />
			</div>
		</Link>
	);
}

function EmptyState({ slug }: { slug: string }) {
	const [copied, setCopied] = useState(false);
	const command = `plantifiles push plan.mdx --workspace ${slug}`;
	return (
		<div className="mt-10 max-w-measure">
			<h2 className="font-display font-medium text-2xl">Nothing has been proposed yet.</h2>
			<p className="mt-3 text-muted-foreground leading-7">
				Publishing is the CLI's job. Run this from the agent session that wrote the plan.
			</p>
			<div className="mt-6 flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-4">
				<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{command}</code>
				<Button
					size="icon-sm"
					variant="quiet"
					aria-label="Copy push command"
					onClick={async () => {
						await navigator.clipboard.writeText(command);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? <Check /> : <Copy />}
				</Button>
			</div>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<output className="block" aria-label="Loading plans">
			<div className="border-b pb-8">
				<div className="h-3 w-20 animate-pulse rounded bg-muted" />
				<div className="mt-4 h-11 w-64 animate-pulse rounded bg-muted" />
				<div className="mt-4 h-4 w-96 animate-pulse rounded bg-muted" />
			</div>
			<div className="mt-8 space-y-6">
				{[0, 1, 2, 3, 4].map((row) => (
					<div key={row} className="space-y-2 border-b pb-5">
						<div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
						<div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
					</div>
				))}
			</div>
		</output>
	);
}
