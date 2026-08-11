import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { getDashboardData } from "#/lib/app-data";
import { type PlanStatus, StatusChip } from "./-components/status-chip";

const dashboardSearchSchema = z.object({
	status: z.enum(["draft", "in_review", "approved", "building", "shipped", "archived"]).optional(),
	q: z.string().optional(),
});

export const Route = createFileRoute("/w/$slug/")({
	validateSearch: dashboardSearchSchema,
	loader: ({ params }) => getDashboardData({ data: params }),
	component: Dashboard,
	pendingComponent: DashboardSkeleton,
});

function relativeTime(value: string): string {
	const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function Dashboard() {
	const plans = Route.useLoaderData();
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [copied, setCopied] = useState(false);
	const visiblePlans = useMemo(
		() =>
			plans.filter(
				(plan) =>
					(!search.status || plan.status === search.status) &&
					(!search.q || plan.title.toLowerCase().includes(search.q.toLowerCase())),
			),
		[plans, search.q, search.status],
	);
	return (
		<section className="space-y-6">
			<header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div>
					<p className="font-mono text-accent text-xs uppercase tracking-widest">Workspace / {slug}</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">Plans</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Review what agents proposed, then send approved context back to the build.
					</p>
				</div>
			</header>
			<div className="flex flex-col gap-3 sm:flex-row">
				<div className="relative max-w-sm flex-1">
					<Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
					<Input
						aria-label="Filter by title"
						className="pl-9"
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
							search: (previous) => ({ ...previous, status: value === "all" ? undefined : (value as PlanStatus) }),
						})
					}
				>
					<SelectTrigger className="w-44">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{(["draft", "in_review", "approved", "building", "shipped", "archived"] as const).map((status) => (
							<SelectItem key={status} value={status}>
								{status.replace("_", " ")}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{plans.length === 0 ? (
				<div className="rounded-lg border border-dashed p-10 text-center">
					<p className="font-medium">Publish the first plan from your agent session.</p>
					<p className="mt-1 text-muted-foreground text-sm">
						The browser teaches the command; the CLI owns publishing.
					</p>
					<div className="mx-auto mt-5 flex max-w-xl items-center gap-2 rounded-md border bg-muted/40 p-2 pl-4 text-left">
						<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
							plantifiles push plan.mdx --workspace {slug}
						</code>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Copy push command"
							onClick={async () => {
								await navigator.clipboard.writeText(`plantifiles push plan.mdx --workspace ${slug}`);
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							}}
						>
							{copied ? <Check /> : <Copy />}
						</Button>
					</div>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border bg-card">
					<div className="grid min-w-[900px] grid-cols-[minmax(18rem,40%)_7rem_4rem_10rem_6rem_6rem_5rem_7rem] border-b bg-muted/30 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<span>Title</span>
						<span>Status</span>
						<span>Version</span>
						<span>Author</span>
						<span>Decisions</span>
						<span>Approvals</span>
						<span>Read time</span>
						<span>Updated</span>
					</div>
					{visiblePlans.map((plan) => (
						<Link
							key={plan.id}
							to="/p/$workspaceSlug/$planSlug"
							params={{ workspaceSlug: slug, planSlug: plan.slug }}
							className="grid h-14 min-w-[900px] grid-cols-[minmax(18rem,40%)_7rem_4rem_10rem_6rem_6rem_5rem_7rem] items-center border-b px-4 text-sm last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
						>
							<span className="truncate font-medium">{plan.title}</span>
							<span>
								<StatusChip status={plan.status} />
							</span>
							<span className="font-mono text-xs">v{plan.version}</span>
							<span className="min-w-0">
								<span className="block truncate">Demo User</span>
								<span className="block truncate text-muted-foreground text-xs">{plan.agentName ?? "hand edit"}</span>
							</span>
							<span className={plan.openDecisions > 0 ? "text-warning" : "text-muted-foreground"}>
								{plan.openDecisions > 0 ? `${plan.openDecisions} open` : "—"}
							</span>
							<span>
								{plan.approvals}/{plan.requiredApprovals}
							</span>
							<span>{Math.max(1, Math.ceil(plan.readTimeMinutes))} min</span>
							<span className="text-muted-foreground">{relativeTime(plan.updatedAt)}</span>
						</Link>
					))}
					{visiblePlans.length === 0 && (
						<p className="p-8 text-center text-muted-foreground text-sm">No plans match these filters.</p>
					)}
				</div>
			)}
		</section>
	);
}

function DashboardSkeleton() {
	return (
		<output className="block space-y-6" aria-label="Loading plans">
			<div className="h-9 w-48 animate-pulse rounded bg-muted" />
			<div className="h-10 w-full animate-pulse rounded bg-muted" />
			<div className="h-72 w-full animate-pulse rounded-lg bg-muted" />
		</output>
	);
}
