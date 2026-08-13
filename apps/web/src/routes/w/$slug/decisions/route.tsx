import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { getWorkspaceDecisions } from "./-data/workspace-decisions";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { StatusChip } from "../../../../components/status-chip";

export const Route = createFileRoute("/w/$slug/decisions")({
	loader: ({ params }) => guardLoader(() => getWorkspaceDecisions({ data: params })),
	component: DecisionsPage,
	pendingComponent: () => <div className="h-72 animate-pulse rounded-lg bg-muted" />,
});

function DecisionsPage() {
	const groups = Route.useLoaderData();
	const { slug } = Route.useParams();
	return (
		<section className="space-y-6">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Decisions</h1>
				<p className="mt-1 text-muted-foreground text-sm">Everything still blocking a build, grouped by plan.</p>
			</header>
			{groups.length === 0 ? (
				<div className="rounded-lg border border-dashed p-10 text-center">
					<CircleHelp className="mx-auto size-8 text-muted-foreground" />
					<p className="mt-3 font-medium">No open decisions.</p>
					<p className="text-muted-foreground text-sm">The workspace is clear to move.</p>
				</div>
			) : (
				groups.map((group) => (
					<section key={group.plan.id} className="overflow-hidden rounded-lg border bg-card">
						<header className="flex h-12 items-center gap-3 border-b bg-muted/30 px-4">
							<h2 className="font-medium">
								<Link
									className="hover:underline"
									to="/p/$workspaceSlug/$planSlug"
									params={{ workspaceSlug: slug, planSlug: group.plan.slug }}
								>
									{group.plan.title}
								</Link>
							</h2>
							<StatusChip status={group.plan.status} />
						</header>
						<ul>
							{group.decisions.map((item) => (
								<li key={item.id} className="border-b last:border-b-0">
									<Link
										to="/p/$workspaceSlug/$planSlug"
										params={{ workspaceSlug: slug, planSlug: group.plan.slug }}
										hash={item.key}
										className="flex items-start gap-3 p-4 hover:bg-muted/40"
									>
										<CircleHelp className="mt-0.5 size-5 text-decision" />
										<span className="min-w-0">
											<span className="block font-medium text-sm">{item.title}</span>
											<span className="mt-1 block font-mono text-muted-foreground text-xs">
												Owner unassigned · {item.key}
											</span>
										</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))
			)}
		</section>
	);
}
