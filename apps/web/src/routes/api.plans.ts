import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorResponse, readJson } from "#/lib/http";
import { createPlan, listPlans } from "#/lib/plans.server";

const publishPlanSchema = z.object({
	workspaceSlug: z.string().min(1),
	slug: z.string().min(1).optional(),
	title: z.string().min(1),
	source: z.string(),
	agentName: z.string().min(1).optional(),
	agentPrompt: z.string().optional(),
	force: z.boolean().optional(),
});

export const Route = createFileRoute("/api/plans")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const workspaceSlug = url.searchParams.get("workspace");
					if (!workspaceSlug) {
						return Response.json({ error: "workspace_required" }, { status: 400 });
					}
					return Response.json(await listPlans(request, workspaceSlug, url.searchParams.get("status") ?? undefined));
				} catch (error) {
					return errorResponse(error);
				}
			},
			POST: async ({ request }) => {
				try {
					const input = publishPlanSchema.safeParse(await readJson(request));
					if (!input.success) {
						return Response.json({ error: "invalid_request", issues: input.error.issues }, { status: 400 });
					}
					return Response.json(await createPlan(request, input.data), { status: 201 });
				} catch (error) {
					return errorResponse(error);
				}
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
