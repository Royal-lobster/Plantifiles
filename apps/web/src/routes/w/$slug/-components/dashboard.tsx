import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@plantifiles/ui/components/input-group";
import { cn } from "@plantifiles/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Search, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InstallInstructions } from "../../../../components/install-instructions";
import { StatusChip } from "../../../../components/status-chip";
import type { DashboardPlan } from "../-data/dashboard";

const route = getRouteApi("/w/$slug/");

export const DASHBOARD_VIEWS = ["active", "review", "approved", "archived", "all"] as const;
type DashboardView = (typeof DASHBOARD_VIEWS)[number];

const VIEW_LABELS: Record<DashboardView, string> = {
	active: "Active",
	review: "Needs review",
	approved: "Approved",
	archived: "Archived",
	all: "All",
};

const VIEW_EMPTY_COPY: Record<DashboardView, string> = {
	active: "No active plans.",
	review: "Nothing waiting on your review.",
	approved: "No approved plans yet.",
	archived: "No archived plans.",
	all: "No plans match these filters.",
};

function matchesView(plan: DashboardPlan, view: DashboardView): boolean {
	if (view === "all") return true;
	if (view === "review") return plan.needsMyReview;
	if (view === "active") return plan.status === "draft" || plan.status === "in_review";
	return plan.status === view;
}

export function Dashboard() {
	const { plans } = route.useLoaderData();
	const { slug } = route.useParams();
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const [installOpen, setInstallOpen] = useState(false);
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
	const view: DashboardView = search.view ?? "active";
	const mineOnly = search.mine === true;
	const normalizedQuery = query.trim().toLowerCase();
	const scopedPlans = useMemo(() => (mineOnly ? plans.filter((plan) => plan.mine) : plans), [plans, mineOnly]);
	const counts = useMemo(() => {
		const next: Record<DashboardView, number> = { active: 0, review: 0, approved: 0, archived: 0, all: 0 };
		for (const plan of scopedPlans) {
			for (const candidate of DASHBOARD_VIEWS) {
				if (matchesView(plan, candidate)) next[candidate] += 1;
			}
		}
		return next;
	}, [scopedPlans]);
	const visiblePlans = useMemo(
		() =>
			scopedPlans.filter(
				(plan) =>
					matchesView(plan, view) &&
					(!normalizedQuery ||
						plan.title.toLowerCase().includes(normalizedQuery) ||
						plan.emoji?.includes(normalizedQuery)),
			),
		[scopedPlans, normalizedQuery, view],
	);

	return (
		<section>
			<header className="flex items-baseline gap-3 border-b border-foreground/[0.08] pb-4">
				<h1 className="font-medium text-2xl tracking-tight">Plans</h1>
				<span className="font-mono text-muted-foreground text-xs">
					{counts[view]} {counts[view] === 1 ? "plan" : "plans"}
				</span>
				<Button variant="quiet" size="sm" className="ml-auto self-center" onClick={() => setInstallOpen(true)}>
					<Terminal aria-hidden="true" />
					Install CLI
				</Button>
			</header>

			{plans.length === 0 ? (
				<EmptyState />
			) : (
				<>
					<nav aria-label="Plan views" className="mt-6 flex flex-wrap items-center gap-1">
						{DASHBOARD_VIEWS.map((candidate) => (
							<button
								key={candidate}
								type="button"
								aria-pressed={candidate === view}
								onClick={() =>
									void navigate({
										search: (previous) => ({
											...previous,
											view: candidate === "active" ? undefined : candidate,
										}),
									})
								}
								className={cn(
									"flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
									candidate === view ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
								)}
							>
								{VIEW_LABELS[candidate]}
								<span
									className={cn(
										candidate === "review" && counts.review > 0 ? "text-warning" : "text-muted-foreground/70",
									)}
								>
									{counts[candidate]}
								</span>
							</button>
						))}
					</nav>

					<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
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
						<button
							type="button"
							aria-pressed={mineOnly}
							onClick={() =>
								void navigate({ search: (previous) => ({ ...previous, mine: mineOnly ? undefined : true }) })
							}
							className={cn(
								"h-9 rounded-xl px-3 font-mono text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
								mineOnly ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
							)}
						>
							Mine
						</button>
					</div>

					{visiblePlans.length === 0 ? (
						<output className="block py-16 text-center text-muted-foreground text-sm" aria-live="polite">
							{normalizedQuery || mineOnly ? "No plans match these filters." : VIEW_EMPTY_COPY[view]}
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
			{installOpen ? (
				<Dialog open onOpenChange={setInstallOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Install Plantifiles</DialogTitle>
							<DialogDescription>
								The CLI publishes plans from the terminal; the write-plan skill teaches your agent the format.
							</DialogDescription>
						</DialogHeader>
						<InstallInstructions />
					</DialogContent>
				</Dialog>
			) : null}
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
					{plan.mine ? null : <CreatorAvatar name={plan.creatorName} image={plan.creatorImage} />}
					{plan.needsMyReview ? (
						<span className="shrink-0 font-mono text-[11px] text-warning">needs your review</span>
					) : null}
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
function CreatorAvatar({ name, image }: { name: string; image: string | null }) {
	const label = `Created by ${name}`;

	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-ink/15 font-semibold text-[10px] text-brand-ink ring-1 ring-foreground/10"
		>
			{image ? (
				<img src={image} alt="" className="size-full object-cover" />
			) : (
				<span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
			)}
		</span>
	);
}

function EmptyState() {
	return (
		<div className="mt-10">
			<h2 className="font-display font-medium text-2xl">Nothing has been proposed yet.</h2>
			<p className="mt-3 max-w-xl text-muted-foreground leading-7">
				Publishing is the CLI's job. Set it up here, or hand the setup to the agent session that writes your plans.
			</p>
			<InstallInstructions className="mt-6" />
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
			<div className="mt-6 flex gap-1">
				{[0, 1, 2, 3, 4].map((tab) => (
					<div key={tab} className="h-7 w-16 animate-pulse rounded-xl bg-muted" />
				))}
			</div>
			<div className="mt-4 h-9 w-full max-w-xs animate-pulse rounded-2xl bg-muted" />
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
