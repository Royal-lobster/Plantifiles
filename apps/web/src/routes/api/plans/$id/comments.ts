import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createComment } from "#/lib/data/comments.server";
import { errorResponse, readJson } from "#/lib/helpers/http";

const createCommentSchema = z.object({
	blockKey: z.string().min(1).optional(),
	parentId: z.string().min(1).optional(),
	body: z.string().trim().min(1).max(10_000),
	agentAssisted: z.boolean().optional(),
});

export const Route = createFileRoute("/api/plans/$id/comments")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				try {
					const input = createCommentSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await createComment(request, params.id, input.data), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
