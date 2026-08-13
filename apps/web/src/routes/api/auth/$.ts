import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/lib/integrations/auth.server";
import { errorResponse } from "#/lib/helpers/http";

async function handleAuth(request: Request): Promise<Response> {
	try {
		return await (await getAuth()).handler(request);
	} catch (error) {
		return errorResponse(error);
	}
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => handleAuth(request),
			POST: ({ request }) => handleAuth(request),
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
