import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Clock3, FileDown, History } from "lucide-react";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";
import { StatusChip } from "./-components/status-chip";

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug")({
	server: {
		handlers: {
			GET: async ({ request, params, next }) => {
				try {
					return await negotiatePlanResponse(request, params, next, async (planRequest, routeParams) => {
						const document = await loadPlanDocument(planRequest, routeParams.workspaceSlug, routeParams.planSlug);
						return renderPlanMarkdown(document);
					});
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
	loader: ({ params }) => getPlanForRoute({ data: params }),
	component: PlanPage,
	pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-muted" />,
});

function PlanPage() {
	const document = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	if (pathname.includes(`/${planSlug}/v/`)) return <Outlet />;
	return (
		<section className="space-y-8">
			<header className="space-y-4 border-b pb-6">
				<div className="flex flex-wrap items-center gap-2">
					<StatusChip status={document.plan.status} />
					<span className="font-mono text-muted-foreground text-xs">v{document.version.number}</span>
					<span className="flex items-center gap-1 text-muted-foreground text-xs">
						<Clock3 className="size-3.5" />
						{Math.max(1, Math.ceil(document.version.lintReport.readTimeMinutes))} min
					</span>
				</div>
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
					<div>
						<h1 className="font-semibold text-3xl tracking-tight">{document.plan.title}</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							Edited by {document.author.name}
							{document.version.agentName ? ` via ${document.version.agentName}` : " by hand"}
						</p>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" asChild>
							<Link to="/p/$workspaceSlug/$planSlug/v/$number" params={{ workspaceSlug, planSlug, number: "1" }}>
								<History /> Version history
							</Link>
						</Button>
						<Button variant="outline" asChild>
							<a href={`/p/${workspaceSlug}/${planSlug}?format=md`}>
								<FileDown /> Markdown
							</a>
						</Button>
					</div>
				</div>
			</header>
			<article className="max-w-[68ch] space-y-6">
				<pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-5 font-mono text-sm leading-6">
					{document.version.source}
				</pre>
			</article>
		</section>
	);
}
