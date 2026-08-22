import { Button } from "@plantifiles/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@plantifiles/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { cn } from "@plantifiles/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Check, Copy, ListFilter, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PLAN_STATUSES, type PlanStatus } from "#/lib/data/plan-types";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import { PLAN_STATUS_PRESENTATION, StatusChip } from "../../../../components/status-chip";
import type { DashboardPlan } from "../-data/dashboard";

const route = getRouteApi("/w/$slug/");

export function Dashboard() {
	const { plans } = route.useLoaderData();
	const { slug } = route.useParams();
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const [query, setQuery] = useState(search.q ?? "");
	const pendingQueryRef = useRef<string | undefined | null>(null);
	useEffect(() => {
		if (pendingQueryRef.current !== null && pendingQueryRef.current === search.q) {
			pendingQueryRef.current = null;
			return;
		}
		setQuery(search.q ?? "");
	}, [search.q]);
	useEffect(() => {
		const q = query || undefined;
		if (q === search.q) return;
		const timer = window.setTimeout(() => {
			pendingQueryRef.current = q;
			void navigate({ search: (previous) => ({ ...previous, q }), replace: true });
		}, 150);
		return () => window.clearTimeout(timer);
	}, [navigate, query, search.q]);
	const normalizedQuery = query.trim().toLowerCase();
	const visiblePlans = useMemo(
		() =>
			plans.filter(
				(plan) =>
					(!search.status || plan.status === search.status) &&
					(!normalizedQuery ||
						plan.title.toLowerCase().includes(normalizedQuery) ||
						plan.emoji?.includes(normalizedQuery)),
			),
		[plans, normalizedQuery, search.status],
	);

	return (
		<section>
			<header className="flex items-baseline gap-3 border-b border-foreground/[0.08] pb-4">
				<h1 className="font-medium text-2xl tracking-tight">Plans</h1>
				<span className="font-mono text-muted-foreground text-xs">
					{plans.length} {plans.length === 1 ? "plan" : "plans"}
				</span>
			</header>

			{plans.length === 0 ? (
				<EmptyState slug={slug} />
			) : (
				<>
					<div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center">
						<InputGroup className="h-9 flex-1 sm:max-w-xs">
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								aria-label="Filter by title or emoji"
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
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
								<SelectValue>{search.status ? search.status.replace("_", " ") : "All statuses"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									<ListFilter className="size-3.5 text-muted-foreground" />
									All statuses
								</SelectItem>
								{PLAN_STATUSES.map((status) => {
									const { icon: Icon, ink } = PLAN_STATUS_PRESENTATION[status];
									return (
										<SelectItem key={status} value={status}>
											<Icon className={cn("size-3.5", ink)} />
											{status.replace("_", " ")}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>

					{visiblePlans.length === 0 ? (
						<output className="block py-16 text-center text-muted-foreground text-sm" aria-live="polite">
							No plans match these filters.
						</output>
					) : (
						<ul className="space-y-1">
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
			className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-2xl px-4 py-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30 sm:grid-cols-[minmax(0,1fr)_auto_5rem_3rem]"
		>
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-2.5">
					<span aria-hidden="true" className="shrink-0 text-lg">
						{plan.emoji ?? "📝"}
					</span>
					<h2 className="truncate font-medium text-sm">{plan.title}</h2>
				</div>
				<p className="mt-1 pl-7 font-mono text-[11px] text-muted-foreground sm:hidden">
					{plan.openDecisions} open · v{plan.version}
				</p>
			</div>
			<StatusChip status={plan.status} />
			<span
				className={cn(
					"hidden font-mono text-xs sm:block",
					plan.openDecisions > 0 ? "text-warning" : "text-muted-foreground",
				)}
			>
				{plan.openDecisions > 0 ? `${plan.openDecisions} open` : "—"}
			</span>
			<span className="hidden font-mono text-muted-foreground text-xs sm:block">v{plan.version}</span>
		</Link>
	);
}

function EmptyState({ slug }: { slug: string }) {
	const clipboard = useClipboard();
	const command = `plantifiles push plan.mdx --workspace ${slug}`;

	return (
		<div className="mt-10">
			<h2 className="font-display font-medium text-2xl">Nothing has been proposed yet.</h2>
			<p className="mt-3 text-muted-foreground leading-7">
				Publishing is the CLI's job. Run this from the agent session that wrote the plan.
			</p>
			<div className="surface-inset mt-6 flex items-center gap-3 p-3 pl-5">
				<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{command}</code>
				<Button
					size="icon-sm"
					variant="quiet"
					aria-label="Copy push command"
					onClick={() => void clipboard.copy(command)}
				>
					{clipboard.status === "copied" ? <Check /> : <Copy />}
				</Button>
			</div>
			<output aria-live="polite" className="mt-2 block min-h-5 text-muted-foreground text-xs">
				{clipboard.status === "copied"
					? "Push command copied."
					: clipboard.status === "error"
						? "Couldn't copy the push command. Select it and copy manually."
						: ""}
			</output>
		</div>
	);
}

export function DashboardSkeleton() {
	return (
		<output className="block" aria-label="Loading plans">
			<div className="flex items-baseline gap-3 border-b border-foreground/[0.08] pb-4">
				<div className="h-7 w-20 animate-pulse rounded-2xl bg-muted" />
				<div className="h-3 w-12 animate-pulse rounded-xl bg-muted" />
			</div>
			<div className="mt-6 h-9 w-full max-w-xs animate-pulse rounded-2xl bg-muted" />
			<div className="mt-6 space-y-1">
				{[0, 1, 2, 3, 4, 5].map((row) => (
					<div key={row} className="flex h-16 animate-pulse items-center gap-3 rounded-2xl px-4">
						<div className="size-5 rounded-xl bg-muted" />
						<div className="h-4 flex-1 rounded-2xl bg-muted" />
						<div className="h-5 w-20 rounded-xl bg-muted" />
					</div>
				))}
			</div>
		</output>
	);
}
