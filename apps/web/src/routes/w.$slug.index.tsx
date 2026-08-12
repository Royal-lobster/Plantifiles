import { Button } from "@plantifiles/ui/components/button";
import { Card, CardContent, CardFooter } from "@plantifiles/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@plantifiles/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, ListFilter, Search } from "lucide-react";
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
					(!search.q || plan.title.toLowerCase().includes(search.q.toLowerCase()) || plan.emoji?.includes(search.q)),
			),
		[plans, search.q, search.status],
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
						<InputGroup className="h-9 flex-1 sm:max-w-xs">
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								aria-label="Filter by title or emoji"
								value={search.q ?? ""}
								onChange={(event) =>
									void navigate({ search: (previous) => ({ ...previous, q: event.target.value || undefined }) })
								}
								placeholder="Filter title or emoji"
							/>
						</InputGroup>
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
								<ListFilter className="size-3.5 text-muted-foreground" />
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

					{visiblePlans.length === 0 ? (
						<p className="py-16 text-center text-muted-foreground text-sm">No plans match these filters.</p>
					) : (
						<ul className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 md:grid-cols-3">
							{visiblePlans.map((plan) => (
								<li key={plan.id}>
									<PlanEntry plan={plan} workspaceSlug={slug} />
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</section>
	);
}

function PlanEntry({ plan, workspaceSlug }: { plan: DashboardPlan; workspaceSlug: string }) {
	return (
		<Link
			to="/p/$workspaceSlug/$planSlug"
			params={{ workspaceSlug, planSlug: plan.slug }}
			className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Card
				size="sm"
				className="h-full min-h-48 justify-between transition group-hover:-translate-y-0.5 group-hover:ring-brand-ink/30"
			>
				<CardContent className="flex items-start justify-between gap-2">
					<span
						aria-hidden="true"
						className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl ring-1 ring-primary/20 transition-transform group-hover:scale-105"
					>
						{plan.emoji ?? "📝"}
					</span>
					<StatusChip status={plan.status} size="sm" />
				</CardContent>
				<CardContent>
					<h3 className="line-clamp-2 font-medium text-base leading-snug tracking-tight transition-colors group-hover:text-brand-ink">
						{plan.title}
					</h3>
				</CardContent>
				<CardFooter className="gap-2 font-mono text-[11px] text-muted-foreground">
					<span className={plan.openDecisions > 0 ? "text-warning" : undefined}>{plan.openDecisions} open</span>
					<span className="text-border">·</span>
					<span>v{plan.version}</span>
				</CardFooter>
			</Card>
		</Link>
	);
}

function EmptyState({ slug }: { slug: string }) {
	const [copied, setCopied] = useState(false);
	const command = `plantifiles push plan.mdx --workspace ${slug}`;
	return (
		<div className="mt-10">
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
			<div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
				{[0, 1, 2, 3, 4, 5].map((card) => (
					<div key={card} className="min-h-52 animate-pulse rounded-xl border bg-muted/40 p-4">
						<div className="size-16 rounded-full bg-muted" />
						<div className="mt-5 h-5 w-4/5 rounded bg-muted" />
						<div className="mt-2 h-5 w-3/5 rounded bg-muted" />
					</div>
				))}
			</div>
		</output>
	);
}
