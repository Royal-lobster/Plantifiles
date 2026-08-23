import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { listMoveTargets, movePlan, PlanSlugConflictError } from "#/lib/data/move-plan.server";
import { errorResponse, readJson } from "#/lib/helpers/http";

const movePlanSchema = z.object({
	workspaceSlug: z.string().min(1),
	/** Only needed when the destination already holds a plan at this slug. */
	slug: z.string().min(1).optional(),
});

export const Route = createFileRoute("/api/plans/$id/move")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					return Response.json(await listMoveTargets(request, params.id));
				} catch (error) {
					return errorResponse(error);
				}
			},
			POST: async ({ request, params }) => {
				try {
					const input = movePlanSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await movePlan(request, params.id, input.data));
				} catch (error) {
					if (error instanceof PlanSlugConflictError) {
						return Response.json(
							{
								error: "slug_conflict",
								message: error.message,
								workspaceSlug: error.workspaceSlug,
								slug: error.slug,
							},
							{ status: 409 },
						);
					}
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
