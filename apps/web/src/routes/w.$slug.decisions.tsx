import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { getWorkspaceDecisions } from "#/lib/app-data";
import { StatusChip } from "./-components/status-chip";

export const Route = createFileRoute("/w/$slug/decisions")({
	loader: ({ params }) => getWorkspaceDecisions({ data: params }),
	component: DecisionsPage,
	pendingComponent: () => <div className="h-72 animate-pulse rounded-lg bg-muted" />,
});

function DecisionsPage() {
	const decisions = Route.useLoaderData();
	const { slug } = Route.useParams();
	const groups = new Map<string, typeof decisions>();
	for (const item of decisions) groups.set(item.plan.id, [...(groups.get(item.plan.id) ?? []), item]);
	return (
		<section className="space-y-6">
			<header>
				<p className="font-mono text-accent text-xs uppercase tracking-widest">Workspace / Decisions</p>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">Open decisions</h1>
				<p className="mt-1 text-muted-foreground text-sm">Everything still blocking a build, grouped by plan.</p>
			</header>
			{decisions.length === 0 ? (
				<div className="rounded-lg border border-dashed p-10 text-center">
					<CircleHelp className="mx-auto size-8 text-muted-foreground" />
					<p className="mt-3 font-medium">No open decisions.</p>
					<p className="text-muted-foreground text-sm">The workspace is clear to move.</p>
				</div>
			) : (
				[...groups.values()].map((items) => {
					const target = items[0];
					if (!target) return null;
					return (
						<div key={target.plan.id} className="overflow-hidden rounded-lg border bg-card">
							<div className="flex h-12 items-center gap-3 border-b bg-muted/30 px-4">
								<Link
									className="font-medium hover:underline"
									to="/p/$workspaceSlug/$planSlug"
									params={{ workspaceSlug: slug, planSlug: target.plan.slug }}
								>
									{target.plan.title}
								</Link>
								<StatusChip status={target.plan.status} />
							</div>
							{items.map((item) => (
								<Link
									key={item.id}
									to="/p/$workspaceSlug/$planSlug"
									params={{ workspaceSlug: slug, planSlug: item.plan.slug }}
									hash={item.key}
									className="flex items-start gap-3 border-b p-4 last:border-b-0 hover:bg-muted/40"
								>
									<CircleHelp className="mt-0.5 size-5 text-decision" />
									<span className="min-w-0">
										<span className="block font-medium text-sm">
											{item.question.replace(/^<Decision[^>]*>\s*|\s*<\/Decision>$/g, "")}
										</span>
										<span className="mt-1 block font-mono text-muted-foreground text-xs">
											Owner unassigned · {item.key}
										</span>
									</span>
								</Link>
							))}
						</div>
					);
				})
			)}
		</section>
	);
}
