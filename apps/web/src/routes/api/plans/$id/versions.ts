import { publishVersionInputSchema } from "@plantifiles/api-contract";
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, readJson } from "#/lib/helpers/http";
import { getVersionHistory } from "#/lib/data/plan-reader.server";
import { createPlanVersion } from "#/lib/data/publish-plan.server";

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
					const input = publishVersionInputSchema.safeParse(await readJson(request));
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
