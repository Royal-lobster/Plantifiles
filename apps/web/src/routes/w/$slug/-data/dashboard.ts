import type { PlanStatus } from "@plantifiles/api-contract";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { listPlans } from "#/lib/data/plan-reader.server";

export type DashboardPlan = {
	id: string;
	slug: string;
	title: string;
	emoji: string | null;
	status: PlanStatus;
	updatedAt: string;
	version: number;
	agentName: string | null;
	openDecisions: number;
	approvals: number;
	readTimeMinutes: number;
	authorName: string;
	creatorName: string;
	creatorImage: string | null;
	mine: boolean;
	needsMyReview: boolean;
};

export type DashboardData = {
	plans: DashboardPlan[];
	nextCursor: string | null;
};

export const getDashboardData = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string().min(1), cursor: z.string().min(1).optional() }))
	.handler(async ({ data }): Promise<DashboardData> => {
		const page = await listPlans(getRequest(), data.slug, {
			limit: 50,
			...(data.cursor ? { cursor: data.cursor } : {}),
		});
		return {
			plans: page.items.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
			nextCursor: page.nextCursor,
		};
	});
