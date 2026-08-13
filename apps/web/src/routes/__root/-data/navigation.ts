import { membership, workspace } from "@plantifiles/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { asc, eq } from "drizzle-orm";
import { authenticateRequest, type RequestIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";

export type NavigationData = {
	user: { id: string; name: string; email: string; image: string | null } | null;
	workspaces: Array<{ id: string; slug: string; name: string; role: "owner" | "member" }>;
};

export const getNavigationData = createServerFn({ method: "GET" }).handler(async (): Promise<NavigationData> => {
	let identity: RequestIdentity | null;
	try {
		identity = await authenticateRequest(getRequest());
	} catch {
		return { user: null, workspaces: [] };
	}
	if (!identity) return { user: null, workspaces: [] };

	const workspaces = await getDb()
		.select({ id: workspace.id, slug: workspace.slug, name: workspace.name, role: membership.role })
		.from(membership)
		.innerJoin(workspace, eq(membership.workspaceId, workspace.id))
		.where(eq(membership.userId, identity.user.id))
		.orderBy(asc(workspace.name));

	return {
		user: {
			id: identity.user.id,
			name: identity.user.name,
			email: identity.user.email,
			image: identity.user.image,
		},
		workspaces,
	};
});
