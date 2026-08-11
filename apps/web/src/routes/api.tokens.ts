import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorResponse, readJson } from "#/lib/http";
import { createApiToken, listApiTokens } from "#/lib/tokens.server";

const tokenSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const Route = createFileRoute("/api/tokens")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					return Response.json(await listApiTokens(request));
				} catch (error) {
					return errorResponse(error);
				}
			},
			POST: async ({ request }) => {
				try {
					const input = tokenSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await createApiToken(request, input.data.name), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
