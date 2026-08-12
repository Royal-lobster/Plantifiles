import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorResponse, readJson } from "#/lib/http";
import { createPlanVersion, getVersionHistory } from "#/lib/plans.server";

const publishVersionSchema = z.object({
	source: z.string(),
	agentName: z.string().min(1).optional(),
	agentPrompt: z.string().optional(),
	force: z.boolean().optional(),
});

export const Route = createFileRoute("/api/plans/$id/versions")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					return Response.json(await getVersionHistory(request, params.id));
				} catch (error) {
					return errorResponse(error);
				}
			},
			POST: async ({ request, params }) => {
				try {
					const input = publishVersionSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await createPlanVersion(request, params.id, input.data), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
