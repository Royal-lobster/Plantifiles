import { createFileRoute } from "@tanstack/react-router";
import { getPlanForRoute } from "#/lib/plan-data";
import { PlanEditor } from "./-components/plan-editor";

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug/edit")({
	loader: async ({ params }) => {
		const data = await getPlanForRoute({
			data: { workspaceSlug: params.workspaceSlug, planSlug: params.planSlug },
		});
		if (!data.viewer) throw new Response("Authentication required.", { status: 401 });
		return data;
	},
	component: PlanEditPage,
});

function PlanEditPage() {
	const data = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	return <PlanEditor data={data} workspaceSlug={workspaceSlug} planSlug={planSlug} />;
}
