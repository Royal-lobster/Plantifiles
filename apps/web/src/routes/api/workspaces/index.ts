import { createFileRoute } from "@tanstack/react-router";
import { listWorkspacesForUser } from "#/lib/data/workspaces.server";
import { errorResponse } from "#/lib/helpers/http";
import { requireIdentity } from "#/lib/integrations/request-auth.server";

export const Route = createFileRoute("/api/workspaces/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const identity = await requireIdentity(request);
					return Response.json(await listWorkspacesForUser(identity.user));
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
