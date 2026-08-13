import { membership, user, workspace } from "@plantifiles/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";

export const getWorkspaceSettings = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string().min(1) }))
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
		if (!target || target.role !== "owner") throw new Response("Forbidden", { status: 403 });
		await db
			.update(workspace)
			.set({ name: data.name, requiredApprovals: data.requiredApprovals })
			.where(eq(workspace.id, target.workspace.id));
		return { name: data.name, requiredApprovals: data.requiredApprovals };
	});
