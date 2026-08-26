import { createCommentRequestSchema } from "@plantifiles/api-contract";
import { createFileRoute } from "@tanstack/react-router";
import { createComment } from "#/lib/data/comments.server";
import { errorResponse, readJson } from "#/lib/helpers/http";

export const Route = createFileRoute("/api/plans/$id/comments")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				try {
					const input = createCommentRequestSchema.safeParse(await readJson(request));
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
