import type { WorkspaceSummary } from "@plantifiles/api-contract";
import { membership, workspace } from "@plantifiles/db/schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "#/lib/integrations/runtime.server";

/**
 * List only Clerk-linked Organization projections. Transition-era memberships
 * must not authorize an unlinked workspace merely because the local row still
 * exists for plan history.
 */
export async function listWorkspacesForUser(user: { id: string }): Promise<WorkspaceSummary[]> {
	return getDb()
		.select({
			id: workspace.id,
			slug: workspace.slug,
			name: workspace.name,
			role: membership.role,
		})
		.from(membership)
		.innerJoin(workspace, eq(membership.workspaceId, workspace.id))
		.where(and(eq(membership.userId, user.id), isNotNull(workspace.clerkOrganizationId)))
		.orderBy(asc(workspace.name));
}
