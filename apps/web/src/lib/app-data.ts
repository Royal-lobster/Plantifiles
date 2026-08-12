import { normalize } from "@plantifiles/core";
import { decision, membership, plan, planVersion, user, workspace } from "@plantifiles/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { listPlans } from "./plans.server";
import { authenticateRequest, type RequestIdentity, requireIdentity } from "./request-auth.server";
import { getDb, getRuntimeEnv } from "./runtime.server";

const workspaceParamsSchema = z.object({ slug: z.string().min(1) });

export type NavigationData = {
	user: { id: string; name: string; email: string; image: string | null } | null;
	workspaces: Array<{ id: string; slug: string; name: string; role: "owner" | "admin" | "member" | "viewer" }>;
	plans: Array<{ id: string; slug: string; title: string; workspaceId: string }>;
	decisions: Array<{ id: string; key: string; planId: string }>;
};

export const getNavigationData = createServerFn({ method: "GET" }).handler(async (): Promise<NavigationData> => {
	let identity: RequestIdentity | null;
	try {
		identity = await authenticateRequest(getRequest());
	} catch {
		return { user: null, workspaces: [], plans: [], decisions: [] };
	}
	if (!identity) return { user: null, workspaces: [], plans: [], decisions: [] };
	const navigationUser = {
		id: identity.user.id,
		name: identity.user.name,
		email: identity.user.email,
		image: identity.user.image,
	};
	const db = getDb();
	const workspaces = await db
		.select({ id: workspace.id, slug: workspace.slug, name: workspace.name, role: membership.role })
		.from(membership)
		.innerJoin(workspace, eq(membership.workspaceId, workspace.id))
		.where(eq(membership.userId, identity.user.id))
		.orderBy(asc(workspace.name));
	const workspaceIds = workspaces.map((item) => item.id);
	if (workspaceIds.length === 0) return { user: navigationUser, workspaces, plans: [], decisions: [] };
	const plans = await db
		.select({ id: plan.id, slug: plan.slug, title: plan.title, workspaceId: plan.workspaceId })
		.from(plan)
		.where(inArray(plan.workspaceId, workspaceIds))
		.orderBy(asc(plan.title));
	const planIds = plans.map((item) => item.id);
	const decisions =
		planIds.length === 0
			? []
			: await db
					.select({ id: decision.id, key: decision.key, planId: decision.planId })
					.from(decision)
					.where(and(inArray(decision.planId, planIds), eq(decision.status, "open")));
	return { user: navigationUser, workspaces, plans, decisions };
});

export type PlanStatus = "draft" | "in_review" | "approved" | "building" | "shipped" | "archived";

export type DashboardPlan = {
	id: string;
	slug: string;
	title: string;
	status: PlanStatus;
	updatedAt: string;
	version: number;
	agentName: string | null;
	openDecisions: number;
	approvals: number;
	requiredApprovals: number;
	readTimeMinutes: number;
	authorName: string;
};

export type DashboardData = {
	workspace: { name: string; slug: string };
	plans: DashboardPlan[];
};

export const getDashboardData = createServerFn({ method: "GET" })
	.validator(workspaceParamsSchema)
	.handler(async ({ data }): Promise<DashboardData> => {
		const request = getRequest();
		const [plans, workspaceRows] = await Promise.all([
			listPlans(request, data.slug),
			getDb()
				.select({ name: workspace.name, slug: workspace.slug })
				.from(workspace)
				.where(eq(workspace.slug, data.slug))
				.limit(1),
		]);
		return {
			workspace: workspaceRows[0] ?? { name: data.slug, slug: data.slug },
			plans: plans.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
		};
	});

export const getWorkspaceSettings = createServerFn({ method: "GET" })
	.validator(workspaceParamsSchema)
	.handler(async ({ data }) => {
		const identity = await requireIdentity(getRequest());
		const db = getDb();
		const workspaces = await db.select().from(workspace).where(eq(workspace.slug, data.slug)).limit(1);
		const target = workspaces[0];
		if (!target) throw new Response("Workspace not found", { status: 404 });
		const access = await db
			.select({ role: membership.role })
			.from(membership)
			.where(and(eq(membership.workspaceId, target.id), eq(membership.userId, identity.user.id)))
			.limit(1);
		if (!access[0]) throw new Response("Forbidden", { status: 403 });
		const members = await db
			.select({ id: user.id, name: user.name, email: user.email, image: user.image, role: membership.role })
			.from(membership)
			.innerJoin(user, eq(membership.userId, user.id))
			.where(eq(membership.workspaceId, target.id))
			.orderBy(asc(user.name));
		return { workspace: target, members, role: access[0].role };
	});

export const updateWorkspaceSettings = createServerFn({ method: "POST" })
	.validator(z.object({ slug: z.string(), name: z.string().trim().min(1), requiredApprovals: z.number().int().min(1) }))
	.handler(async ({ data }) => {
		const identity = await requireIdentity(getRequest());
		const db = getDb();
		const rows = await db
			.select({ workspace, role: membership.role })
			.from(workspace)
			.innerJoin(membership, eq(membership.workspaceId, workspace.id))
			.where(and(eq(workspace.slug, data.slug), eq(membership.userId, identity.user.id)))
			.limit(1);
		const target = rows[0];
		if (!target || !["owner", "admin"].includes(target.role)) throw new Response("Forbidden", { status: 403 });
		await db
			.update(workspace)
			.set({ name: data.name, requiredApprovals: data.requiredApprovals })
			.where(eq(workspace.id, target.workspace.id));
		return { ok: true };
	});

export const getWorkspaceDecisions = createServerFn({ method: "GET" })
	.validator(workspaceParamsSchema)
	.handler(async ({ data }) => {
		await requireIdentity(getRequest());
		const db = getDb();
		const rows = await db
			.select({ decision, plan, source: planVersion.source })
			.from(decision)
			.innerJoin(plan, eq(decision.planId, plan.id))
			.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
			.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
			.where(and(eq(workspace.slug, data.slug), eq(decision.status, "open")))
			.orderBy(asc(plan.title));
		return rows.map((row) => ({
			...row.decision,
			plan: { id: row.plan.id, slug: row.plan.slug, title: row.plan.title, status: row.plan.status },
			question: normalize(row.source).find((block) => block.key === row.decision.key)?.source ?? row.decision.key,
		}));
	});

export const createWorkspace = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1), slug: z.string().regex(/^[a-z0-9-]+$/) }))
	.handler(async ({ data }) => {
		const identity = await requireIdentity(getRequest());
		const id = crypto.randomUUID();
		const runtime = getRuntimeEnv();
		await runtime.DB.batch([
			runtime.DB.prepare("insert into workspace (id, slug, name, required_approvals) values (?, ?, ?, 1)").bind(
				id,
				data.slug,
				data.name,
			),
			runtime.DB.prepare("insert into membership (id, user_id, workspace_id, role) values (?, ?, ?, 'owner')").bind(
				crypto.randomUUID(),
				identity.user.id,
				id,
			),
		]);
		return { slug: data.slug };
	});

export const getLoginOptions = createServerFn({ method: "GET" }).handler(() => ({
	localDev: getRuntimeEnv().LOCAL_DEV === "true",
}));
