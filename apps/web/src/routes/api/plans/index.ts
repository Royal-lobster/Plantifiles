import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PLAN_STATUSES } from "#/lib/data/plan-types";
import { errorResponse, readJson } from "#/lib/helpers/http";
import { planEmojiSchema } from "#/lib/helpers/plan-emoji";
import { listPlans } from "#/lib/data/plan-reader.server";
import { createPlan } from "#/lib/data/publish-plan.server";

const publishPlanSchema = z.object({
	workspaceSlug: z.string().min(1),
	slug: z.string().min(1).optional(),
	title: z.string().min(1),
	source: z.string(),
	emoji: planEmojiSchema.optional(),
	agentName: z.string().min(1).optional(),
	agentPrompt: z.string().optional(),
	force: z.boolean().optional(),
});

const planStatusSchema = z.enum(PLAN_STATUSES);

export const Route = createFileRoute("/api/plans/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const workspaceSlug = url.searchParams.get("workspace");
					if (!workspaceSlug) {
						return Response.json({ error: "workspace_required" }, { status: 400 });
					}
					const status = planStatusSchema.optional().safeParse(url.searchParams.get("status") ?? undefined);
					if (!status.success) {
						return Response.json({ error: "invalid_status", issues: status.error.issues }, { status: 400 });
					}
					return Response.json(await listPlans(request, workspaceSlug, status.data));
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
