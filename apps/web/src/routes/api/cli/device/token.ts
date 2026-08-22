import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pollCliAuth } from "#/lib/data/cli-auth.server";
import { errorResponse, readJson } from "#/lib/helpers/http";

const pollSchema = z.object({ deviceCode: z.string().min(1) });

export const Route = createFileRoute("/api/cli/device/token")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const input = pollSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					const result = await pollCliAuth(input.data.deviceCode);
					// 202 keeps "still waiting" out of the client's success path without
					// making the CLI parse an error body on every poll.
					return result.status === "pending"
						? Response.json({ status: "pending" }, { status: 202 })
						: Response.json(result);
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
