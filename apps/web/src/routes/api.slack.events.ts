import { waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { processSlackEvent, type SlackEventEnvelope, verifySlackRequest } from "#/lib/slack.server";

export const Route = createFileRoute("/api/slack/events")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const rawBody = await request.text();
				if (!(await verifySlackRequest(rawBody, request.headers))) {
					return Response.json({ error: "invalid_signature" }, { status: 401 });
				}
				let payload: unknown;
				try {
					payload = JSON.parse(rawBody);
				} catch {
					return Response.json({ error: "invalid_json" }, { status: 400 });
				}
				if (isUrlVerification(payload)) return Response.json({ challenge: payload.challenge });
				if (isSlackEvent(payload)) {
					waitUntil(
						processSlackEvent(payload).catch((error: unknown) => {
							console.error("Slack link unfurl failed", error);
						}),
					);
				}
				return Response.json({ ok: true });
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});

function isUrlVerification(value: unknown): value is { type: "url_verification"; challenge: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		Reflect.get(value, "type") === "url_verification" &&
		typeof Reflect.get(value, "challenge") === "string"
	);
}

function isSlackEvent(value: unknown): value is SlackEventEnvelope {
	if (typeof value !== "object" || value === null) return false;
	const event = Reflect.get(value, "event");
	if (
		Reflect.get(value, "type") !== "event_callback" ||
		typeof Reflect.get(value, "team_id") !== "string" ||
		typeof event !== "object" ||
		event === null ||
		typeof Reflect.get(event, "type") !== "string"
	) {
		return false;
	}
	if (Reflect.get(event, "type") !== "link_shared") return true;
	const links = Reflect.get(event, "links");
	return (
		Array.isArray(links) &&
		links.every((link) => typeof link === "object" && link !== null && typeof Reflect.get(link, "url") === "string")
	);
}
