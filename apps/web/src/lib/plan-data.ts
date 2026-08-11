import type { LintReport } from "@plantifiles/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { loadPlanDocument } from "./plans.server";

const planParamsSchema = z.object({
	workspaceSlug: z.string(),
	planSlug: z.string(),
	number: z.coerce.number().int().positive().optional(),
});

export const getPlanForRoute = createServerFn({ method: "GET" })
	.validator(planParamsSchema)
	.handler(async ({ data }) => {
		const document = await loadPlanDocument(getRequest(), data.workspaceSlug, data.planSlug, data.number);
		return {
			...document,
			plan: { ...document.plan, updatedAt: document.plan.updatedAt.toISOString() },
			version: {
				...document.version,
				lintReport: document.version.lintReport as LintReport,
				createdAt: document.version.createdAt.toISOString(),
			},
			author: {
				...document.author,
				createdAt: document.author.createdAt.toISOString(),
				updatedAt: document.author.updatedAt.toISOString(),
			},
			comments: document.comments.map((item) => ({
				...item,
				resolvedAt: item.resolvedAt?.toISOString() ?? null,
				createdAt: item.createdAt.toISOString(),
			})),
			decisions: document.decisions.map((item) => ({
				...item,
				resolvedAt: item.resolvedAt?.toISOString() ?? null,
			})),
			approvals: document.approvals.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
		};
	});
