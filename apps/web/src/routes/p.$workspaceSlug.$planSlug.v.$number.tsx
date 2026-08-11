import { createFileRoute } from "@tanstack/react-router";
import { negotiatePlanResponse } from "#/lib/content-negotiation";
import { errorResponse } from "#/lib/http";
import { getPlanForRoute } from "#/lib/plan-data";
import { loadPlanDocument, renderPlanMarkdown } from "#/lib/plans.server";

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
});

function VersionPage() {
	const document = Route.useLoaderData();
	return (
		<main>
			<header>
				<p>
					{document.workspace.slug} / version {document.version.number}
				</p>
				<h1>{document.plan.title}</h1>
			</header>
			<article>
				<pre>{document.version.source}</pre>
			</article>
		</main>
	);
}
