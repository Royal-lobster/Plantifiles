import { membership } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { getDb, getRuntimeConfig } from "#/lib/integrations/runtime.server";

async function assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
	const rows = await getDb()
		.select({ id: membership.id })
		.from(membership)
		.where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
		.limit(1);
	if (!rows[0]) throw new Response("Forbidden", { status: 403 });
}

async function publicPlanUrl(workspaceSlug: string, planSlug: string): Promise<string> {
	const { PUBLIC_URL } = await getRuntimeConfig();
	return `${PUBLIC_URL.replace(/\/$/, "")}/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}`;
}

export { assertWorkspaceAccess, publicPlanUrl };
