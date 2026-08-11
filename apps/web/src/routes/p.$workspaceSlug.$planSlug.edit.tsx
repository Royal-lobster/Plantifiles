import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardLoader } from "#/lib/loader-guard";
import { getPlanForRoute } from "#/lib/plan-data";
import { PlanEditor } from "./-components/plan-editor";

export const Route = createFileRoute("/p/$workspaceSlug/$planSlug/edit")({
	loader: async ({ params }) => {
		const data = await guardLoader(() =>
			getPlanForRoute({ data: { workspaceSlug: params.workspaceSlug, planSlug: params.planSlug } }),
		);
		if (!data.viewer) throw redirect({ to: "/login" });
		return data;
	},
	component: PlanEditPage,
});

function PlanEditPage() {
	const data = Route.useLoaderData();
	const { workspaceSlug, planSlug } = Route.useParams();
	return <PlanEditor data={data} workspaceSlug={workspaceSlug} planSlug={planSlug} />;
}
