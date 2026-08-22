import type { WebhookEvent } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { createFileRoute } from "@tanstack/react-router";
import { projectClerkWebhookEvent } from "#/lib/data/clerk-projection.server";
import { getRuntimeConfig } from "#/lib/integrations/runtime.server";

export const Route = createFileRoute("/api/clerk/webhook")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { CLERK_WEBHOOK_SIGNING_SECRET } = await getRuntimeConfig();
				if (!CLERK_WEBHOOK_SIGNING_SECRET) {
					return new Response("Clerk webhook signing secret is not configured.", { status: 503 });
				}

				let event: WebhookEvent;
				try {
					event = await verifyWebhook(request, { signingSecret: CLERK_WEBHOOK_SIGNING_SECRET });
				} catch {
					return new Response("Invalid Clerk webhook signature.", { status: 400 });
				}

				await projectClerkWebhookEvent(event);
				return new Response(null, { status: 204 });
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
