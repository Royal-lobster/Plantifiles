import { plan } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { getDb } from "#/lib/integrations/runtime.server";
import { requireWritablePlanAccess } from "./plan-access.server";

export function canManagePlanSharing(
	target: { createdById: string },
	viewer: { id: string },
	role: "owner" | "member",
): boolean {
	return target.createdById === viewer.id || role === "owner";
}

export async function updatePlanSharing(request: Request, planId: string, visibility: "workspace" | "public") {
	const access = await requireWritablePlanAccess(request, planId);
	if (!canManagePlanSharing(access.plan, access.identity.user, access.role)) {
		throw new Response("Only the plan author or an organization owner can change sharing.", { status: 403 });
	}
	await getDb()
		.update(plan)
		.set({ visibility })
		.where(and(eq(plan.id, planId), eq(plan.workspaceId, access.workspace.id)));
	return { visibility };
}
