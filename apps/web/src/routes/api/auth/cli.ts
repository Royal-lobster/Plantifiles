import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeConfig } from "#/lib/integrations/runtime.server";

export const Route = createFileRoute("/api/auth/cli")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const runtime = await getRuntimeConfig();
				if (!runtime.CLERK_OAUTH_CLIENT_ID) {
					return Response.json({ message: "Plantifiles CLI OAuth is not configured." }, { status: 503 });
				}
				/* The callback has to come back to wherever the browser actually is. One
				   vars profile serves both `localhost` and the hosted dev Worker, so a
				   `PUBLIC_URL`-derived redirect is wrong for one of them. Trusting the
				   request origin is safe because Clerk rejects any redirect the OAuth
				   application has not registered; `PUBLIC_URL` stays as the fallback. */
				const origin = URL.canParse(request.url) ? new URL(request.url).origin : runtime.PUBLIC_URL;
				return Response.json(
					{
						issuer: runtime.CLERK_OAUTH_ISSUER,
						clientId: runtime.CLERK_OAUTH_CLIENT_ID,
						redirectUri: `${origin.replace(/\/$/, "")}/cli/callback`,
						/* Clerk rejects `openid` unless the OAuth application declares it, and the
						   CLI consumes no `id_token`: it reads `sub` from `/oauth/userinfo` with the
						   access token. `email` is what makes the login line name a person. */
						scopes: ["profile", "email", "offline_access", "plantifiles:read", "plantifiles:write"],
					},
					{ headers: { "cache-control": "no-store" } },
				);
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
