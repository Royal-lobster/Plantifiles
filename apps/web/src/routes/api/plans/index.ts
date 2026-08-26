import { listPlansQuerySchema, type PlanPage, publishPlanInputSchema } from "@plantifiles/api-contract";
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, readJson } from "#/lib/helpers/http";
import { listPlans } from "#/lib/data/plan-reader.server";
import { createPlan } from "#/lib/data/publish-plan.server";

export const Route = createFileRoute("/api/plans/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const input = listPlansQuerySchema.safeParse({
						workspaceSlug: url.searchParams.get("workspace") ?? undefined,
						status: url.searchParams.get("status") ?? undefined,
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
					});
					if (!input.success) {
						return Response.json({ error: "invalid_query", issues: input.error.issues }, { status: 400 });
					}
					const { workspaceSlug, status, cursor, limit } = input.data;
					const page = await listPlans(request, workspaceSlug, {
						...(status ? { status } : {}),
						...(cursor ? { cursor } : {}),
						...(limit ? { limit } : {}),
					});
					return Response.json({
						items: page.items.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
						nextCursor: page.nextCursor,
					} satisfies PlanPage);
				} catch (error) {
					return errorResponse(error);
				}
			},
			POST: async ({ request }) => {
				try {
					const input = publishPlanInputSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await createPlan(request, input.data), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
