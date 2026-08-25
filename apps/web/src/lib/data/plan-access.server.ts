import { membership, plan, workspace } from "@plantifiles/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getDb, getRuntimeConfig } from "#/lib/integrations/runtime.server";

async function assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
	const rows = await getDb()
		.select({ id: membership.id })
		.from(membership)
		.innerJoin(workspace, eq(membership.workspaceId, workspace.id))
		.where(
			and(
				eq(membership.workspaceId, workspaceId),
				eq(membership.userId, userId),
				isNotNull(workspace.clerkOrganizationId),
			),
		)
		.limit(1);
	if (!rows[0]) throw new Response("Forbidden", { status: 403 });
}

async function requireWritablePlanAccess(request: Request, planId: string) {
	const identity = await requireIdentity(request, "plantifiles:write");
	const rows = await getDb()
		.select({ plan, workspace, role: membership.role })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(membership, and(eq(membership.workspaceId, workspace.id), eq(membership.userId, identity.user.id)))
		.where(and(eq(plan.id, planId), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const access = rows[0];
	if (!access) throw new Response("Forbidden", { status: 403 });
	return { ...access, identity };
}

async function publicPlanUrl(workspaceSlug: string, planSlug: string): Promise<string> {
	const { PUBLIC_URL } = await getRuntimeConfig();
	return `${PUBLIC_URL.replace(/\/$/, "")}/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}`;
}

export { assertWorkspaceAccess, publicPlanUrl, requireWritablePlanAccess };
