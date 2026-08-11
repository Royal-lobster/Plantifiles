import { createFileRoute } from "@tanstack/react-router";
import { errorResponse } from "#/lib/http";
import { revokeApiToken } from "#/lib/tokens.server";

export const Route = createFileRoute("/api/tokens/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				try {
					await revokeApiToken(request, params.id);
					return new Response(null, { status: 204 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
