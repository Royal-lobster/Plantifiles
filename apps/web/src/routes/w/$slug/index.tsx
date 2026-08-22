import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PLAN_STATUSES } from "#/lib/data/plan-types";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { Dashboard, DashboardSkeleton } from "./-components/dashboard";
import { getDashboardData } from "./-data/dashboard";

const dashboardSearchSchema = z.object({
	status: z.enum(PLAN_STATUSES).optional(),
	q: z.string().optional(),
});

export const Route = createFileRoute("/w/$slug/")({
	validateSearch: dashboardSearchSchema,
	loader: ({ params }) => guardLoader(() => getDashboardData({ data: params })),
	component: Dashboard,
	pendingComponent: DashboardSkeleton,
});
