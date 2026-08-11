import { createFileRoute } from "@tanstack/react-router";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";

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
});

function PlanPage() {
	const document = Route.useLoaderData();
	return (
		<main>
			<header>
				<p>
					{document.workspace.slug} / v{document.version.number}
				</p>
				<h1>{document.plan.title}</h1>
			</header>
			<article>
				<pre>{document.version.source}</pre>
			</article>
		</main>
	);
}
