import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock3 } from "lucide-react";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";
import { StatusChip } from "./-components/status-chip";

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug/v/$number")({
	server: {
		handlers: {
			GET: async ({ request, params, next }) => {
				try {
					return await negotiatePlanResponse(request, params, next, async (planRequest, routeParams) => {
						const number = Number(routeParams.number);
						if (!Number.isInteger(number) || number < 1) throw new Response("Invalid version", { status: 400 });
						const document = await loadPlanDocument(
							planRequest,
							routeParams.workspaceSlug,
							routeParams.planSlug,
							number,
						);
						return renderPlanMarkdown(document);
					});
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
	loader: ({ params }) => getPlanForRoute({ data: params }),
	component: VersionPage,
	pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-muted" />,
});

function VersionPage() {
	const document = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	return (
		<section className="space-y-8">
			<header className="space-y-4 border-b pb-6">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/p/$workspaceSlug/$planSlug" params={{ workspaceSlug, planSlug }}>
						<ArrowLeft /> Current version
					</Link>
				</Button>
				<div className="flex flex-wrap items-center gap-2">
					<StatusChip status={document.plan.status} />
					<span className="font-mono text-muted-foreground text-xs">historical v{document.version.number}</span>
					<span className="flex items-center gap-1 text-muted-foreground text-xs">
						<Clock3 className="size-3.5" />
						{Math.max(1, Math.ceil(document.version.lintReport.readTimeMinutes))} min
					</span>
				</div>
				<h1 className="font-semibold text-3xl tracking-tight">{document.plan.title}</h1>
				<p className="text-muted-foreground text-sm">
					{document.version.changeSummary ?? "Initial published version."}
				</p>
			</header>
			<article className="max-w-[68ch]">
				<pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-5 font-mono text-sm leading-6">
					{document.version.source}
				</pre>
			</article>
		</section>
	);
}
