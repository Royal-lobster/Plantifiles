import { createFileRoute } from "@tanstack/react-router";
import { requireIdentity } from "#/lib/request-auth.server";
import { completeSlackOAuth, verifySlackOAuthState } from "#/lib/slack.server";

export const Route = createFileRoute("/api/slack/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const error = url.searchParams.get("error");
				if (error) return Response.json({ error: `Slack denied the installation: ${error}` }, { status: 400 });
				const code = url.searchParams.get("code");
				const stateValue = url.searchParams.get("state");
				if (!code || !stateValue) return Response.json({ error: "code_and_state_required" }, { status: 400 });
				const state = await verifySlackOAuthState(stateValue);
				if (!state) return Response.json({ error: "invalid_state" }, { status: 400 });
				const identity = await requireIdentity(request);
				if (identity.user.id !== state.userId) return Response.json({ error: "identity_mismatch" }, { status: 403 });
				const installation = await completeSlackOAuth(code, state);
				const destination = new URL(`/w/${encodeURIComponent(installation.workspaceSlug)}/settings`, request.url);
				destination.searchParams.set("slack", "connected");
				return Response.redirect(destination, 303);
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
