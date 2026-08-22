import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeConfig } from "#/lib/integrations/runtime.server";

export const Route = createFileRoute("/api/auth/cli")({
	server: {
		handlers: {
			GET: async () => {
				const runtime = await getRuntimeConfig();
				if (!runtime.CLERK_OAUTH_CLIENT_ID) {
					return Response.json({ message: "Plantifiles CLI OAuth is not configured." }, { status: 503 });
				}
				return Response.json(
					{
						issuer: runtime.CLERK_OAUTH_ISSUER,
						clientId: runtime.CLERK_OAUTH_CLIENT_ID,
						redirectUri: `${runtime.PUBLIC_URL.replace(/\/$/, "")}/cli/callback`,
						scopes: ["openid", "profile", "offline_access", "plantifiles:read", "plantifiles:write"],
					},
					{ headers: { "cache-control": "no-store" } },
				);
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
