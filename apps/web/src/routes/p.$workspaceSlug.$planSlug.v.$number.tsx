import { createFileRoute } from "@tanstack/react-router";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { guardLoader } from "#/lib/loader-guard";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";
import { PlanReader } from "./-components/plan-reader";

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
	loader: ({ params }) => guardLoader(() => getPlanForRoute({ data: params })),
	component: VersionPage,
	pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-muted" />,
});

function VersionPage() {
	const data = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	return <PlanReader data={data} workspaceSlug={workspaceSlug} planSlug={planSlug} />;
}
