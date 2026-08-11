import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";
import { PlanReader } from "./-components/plan-reader";

const planSearchSchema = z.object({
	compareFrom: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug")({
	validateSearch: planSearchSchema,
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
	const data = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	const { compareFrom } = Route.useSearch();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	if (pathname.includes(`/${planSlug}/v/`) || pathname.endsWith(`/${planSlug}/edit`)) return <Outlet />;
	return <PlanReader data={data} workspaceSlug={workspaceSlug} planSlug={planSlug} compareFrom={compareFrom} />;
}
