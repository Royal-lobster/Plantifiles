import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { PlanStatus } from "#/lib/data/plan-types";
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
};

export type DashboardData = {
	plans: DashboardPlan[];
};

export const getDashboardData = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string().min(1) }))
	.handler(async ({ data }): Promise<DashboardData> => {
		const plans = await listPlans(getRequest(), data.slug);
		return {
			plans: plans.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
		};
	});
