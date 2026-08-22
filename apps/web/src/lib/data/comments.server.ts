import { comment, plan, planBlock } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";
import { assertWorkspaceAccess } from "./plan-access.server";

export type CreateCommentInput = {
	blockKey?: string | undefined;
	parentId?: string | undefined;
	body: string;
	agentAssisted?: boolean | undefined;
};

export async function createComment(request: Request, planId: string, input: CreateCommentInput) {
	const identity = await requireIdentity(request);
	const db = getDb();
	const plans = await db.select().from(plan).where(eq(plan.id, planId)).limit(1);
	const target = plans[0];
	if (!target?.currentVersionId) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(target.workspaceId, identity.user.id);

	if (input.blockKey) {
		const blocks = await db
			.select({ id: planBlock.id })
			.from(planBlock)
			.where(and(eq(planBlock.versionId, target.currentVersionId), eq(planBlock.key, input.blockKey)))
			.limit(1);
		if (!blocks[0]) throw new Response("Block not found in the current version", { status: 400 });
	}
	if (input.parentId) {
		const parents = await db.select().from(comment).where(eq(comment.id, input.parentId)).limit(1);
		const parent = parents[0];
		if (!parent || parent.planId !== planId || parent.parentId) {
			throw new Response("Replies may be nested only one level deep.", { status: 400 });
		}
	}

	const id = crypto.randomUUID();
	await db.insert(comment).values({
		id,
		planId,
		versionId: target.currentVersionId,
		blockKey: input.blockKey,
		parentId: input.parentId,
		body: input.body,
		authorId: identity.user.id,
		agentAssisted: input.agentAssisted ?? false,
	});
	const created = await db.select().from(comment).where(eq(comment.id, id)).limit(1);
	return created[0];
}
