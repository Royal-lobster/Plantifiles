import { Button } from "@plantifiles/ui/components/button";
import { Card, CardContent, CardFooter } from "@plantifiles/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@plantifiles/ui/components/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Check, Copy, ListFilter, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanStatus } from "#/lib/data/plan-types";
import type { DashboardPlan } from "../-data/dashboard";
import { StatusChip } from "../../../../components/status-chip";

const route = getRouteApi("/w/$slug/");

const STATUS_ORDER: PlanStatus[] = ["draft", "in_review", "approved", "archived"];

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
						<output className="block py-16 text-center text-muted-foreground text-sm" aria-live="polite">
							No plans match these filters.
						</output>
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
				className="h-full min-h-48 justify-between transition group-hover:-translate-y-0.5 group-hover:ring-brand-ink/30 motion-reduce:transform-none"
			>
				<CardContent className="flex items-start justify-between gap-2">
					<span
						aria-hidden="true"
						className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl ring-1 ring-primary/20 transition-transform group-hover:scale-105 motion-reduce:transform-none"
					>
						{plan.emoji ?? "📝"}
					</span>
					<StatusChip status={plan.status} size="sm" />
				</CardContent>
				<CardContent>
					<h2 className="line-clamp-2 font-medium text-base leading-snug tracking-tight transition-colors group-hover:text-brand-ink">
						{plan.title}
					</h2>
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
	const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
	const resetTimerRef = useRef<number | undefined>(undefined);
	const copyAttemptRef = useRef(0);
	const command = `plantifiles push plan.mdx --workspace ${slug}`;

	useEffect(
		() => () => {
			copyAttemptRef.current += 1;
			window.clearTimeout(resetTimerRef.current);
		},
		[],
	);

	const copyCommand = async () => {
		const attempt = ++copyAttemptRef.current;
		let resetDelay = 1500;
		window.clearTimeout(resetTimerRef.current);
		resetTimerRef.current = undefined;
		setCopyStatus("idle");

		try {
			await navigator.clipboard.writeText(command);
			if (attempt !== copyAttemptRef.current) return;
			setCopyStatus("success");
		} catch {
			if (attempt !== copyAttemptRef.current) return;
			setCopyStatus("error");
			resetDelay = 3000;
		}

		resetTimerRef.current = window.setTimeout(() => {
			setCopyStatus("idle");
			resetTimerRef.current = undefined;
		}, resetDelay);
	};

	return (
		<div className="mt-10">
			<h2 className="font-display font-medium text-2xl">Nothing has been proposed yet.</h2>
			<p className="mt-3 text-muted-foreground leading-7">
				Publishing is the CLI's job. Run this from the agent session that wrote the plan.
			</p>
			<div className="mt-6 flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-4">
				<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{command}</code>
				<Button size="icon-sm" variant="quiet" aria-label="Copy push command" onClick={() => void copyCommand()}>
					{copyStatus === "success" ? <Check /> : <Copy />}
				</Button>
			</div>
			<output aria-live="polite" className="mt-2 block min-h-5 text-muted-foreground text-xs">
				{copyStatus === "success"
					? "Push command copied."
					: copyStatus === "error"
						? "Couldn't copy the push command. Select it and copy manually."
						: ""}
			</output>
		</div>
	);
}

export function DashboardSkeleton() {
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
