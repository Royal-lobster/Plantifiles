import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/lib/auth.server";
import { errorResponse } from "#/lib/http";

async function handleAuth(request: Request): Promise<Response> {
	try {
		return getAuth().handler(request);
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
