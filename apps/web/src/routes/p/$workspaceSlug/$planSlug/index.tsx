import { createFileRoute } from "@tanstack/react-router";
import { negotiatePlanResponse } from "#/lib/helpers/content-negotiation";
import { errorResponse } from "#/lib/helpers/http";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/data/plan-reader.server";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { getPlanReaderData } from "#/routes/p/$workspaceSlug/$planSlug/-data/plan-reader";
import { PlanReader } from "./-components/plan-reader";

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug/")({
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
	loader: ({ params }) => guardLoader(() => getPlanReaderData({ data: params })),
	component: CurrentPlanPage,
	pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-muted" />,
});

function CurrentPlanPage() {
	return <PlanReader data={Route.useLoaderData()} />;
}
