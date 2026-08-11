import { createFileRoute } from "@tanstack/react-router";
import { requireIdentity } from "#/lib/request-auth.server";
import { findSlackInstallTarget, slackAuthorizeUrl } from "#/lib/slack.server";

export const Route = createFileRoute("/api/slack/install")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const workspaceSlug = new URL(request.url).searchParams.get("workspace");
				if (!workspaceSlug) return Response.json({ error: "workspace_required" }, { status: 400 });
				const identity = await requireIdentity(request);
				const target = await findSlackInstallTarget(workspaceSlug, identity.user.id);
				return Response.redirect(await slackAuthorizeUrl(target.id, identity.user.id), 302);
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
