import { createFileRoute } from "@tanstack/react-router";
import { errorResponse } from "#/lib/http";
import { getPlanById } from "#/lib/plans.server";

export const Route = createFileRoute("/api/plans/$id")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					return Response.json(await getPlanById(request, params.id));
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
