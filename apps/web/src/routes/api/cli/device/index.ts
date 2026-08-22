import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { startCliAuth } from "#/lib/data/cli-auth.server";
import { errorResponse, readJson } from "#/lib/helpers/http";

const startSchema = z.object({ tokenName: z.string().trim().min(1).max(80) });

export const Route = createFileRoute("/api/cli/device/")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const input = startSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await startCliAuth(input.data.tokenName), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
