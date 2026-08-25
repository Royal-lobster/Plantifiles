import { approval, comment, decision, type membership, plan, planBlock } from "@plantifiles/db/schema";
import { and, count, eq } from "drizzle-orm";
import { requireWritablePlanAccess } from "./plan-access.server";
import { getDb } from "#/lib/integrations/runtime.server";

type PlanStatus = typeof plan.$inferSelect.status;
type MembershipRole = typeof membership.$inferSelect.role;
const APPROVAL_THRESHOLD = 1;

const NEXT_STATUS: Record<PlanStatus, PlanStatus | null> = {
	draft: "in_review",
	in_review: "approved",
	approved: "archived",
	archived: null,
};

function requireOwner(role: MembershipRole): void {
	if (role !== "owner") throw new Response("Owner access required.", { status: 403 });
}

async function approvalGate(target: typeof plan.$inferSelect): Promise<{ allowed: boolean; reason: string | null }> {
	if (!target.currentVersionId) return { allowed: false, reason: "The plan has no current version." };
	const db = getDb();
	const [openRows, approvalRows] = await Promise.all([
		db
			.select({ count: count() })
			.from(decision)
			.innerJoin(
				planBlock,
				and(
					eq(planBlock.versionId, target.currentVersionId),
					eq(planBlock.kind, "Decision"),
					eq(planBlock.key, decision.key),
				),
			)
			.where(and(eq(decision.planId, target.id), eq(decision.status, "open"))),
		db.select({ count: count() }).from(approval).where(eq(approval.versionId, target.currentVersionId)),
	]);
	const openDecisions = openRows[0]?.count ?? 0;
	const approvals = approvalRows[0]?.count ?? 0;
	if (openDecisions > 0) {
		return {
			allowed: false,
			reason: `${openDecisions} open ${openDecisions === 1 ? "decision blocks" : "decisions block"} approval.`,
		};
	}
	if (approvals < APPROVAL_THRESHOLD) {
		return {
			allowed: false,
			reason: "1 more approval is required on the current version.",
		};
	}
	return { allowed: true, reason: null };
}

async function approveWhenReady(target: typeof plan.$inferSelect) {
	const gate = await approvalGate(target);
	if (gate.allowed && target.status === "in_review") {
		await getDb().update(plan).set({ status: "approved", updatedAt: new Date() }).where(eq(plan.id, target.id));
		return { status: "approved" as const, reason: null };
	}
	return { status: target.status, reason: gate.reason };
}

export async function resolveComment(request: Request, commentId: string, resolved: boolean) {
	const rows = await getDb().select().from(comment).where(eq(comment.id, commentId)).limit(1);
	const target = rows[0];
	if (!target || target.parentId) throw new Response("Comment thread not found.", { status: 404 });
	await requireWritablePlanAccess(request, target.planId);
	await getDb()
		.update(comment)
		.set({ resolvedAt: resolved ? new Date() : null })
		.where(eq(comment.id, commentId));
	return { id: commentId, resolved };
}

export async function resolveDecision(request: Request, planId: string, key: string, resolution: string) {
	const access = await requireWritablePlanAccess(request, planId);
	const rows = await getDb()
		.select()
		.from(decision)
		.where(and(eq(decision.planId, planId), eq(decision.key, key)))
		.limit(1);
	const target = rows[0];
	if (!target) throw new Response("Decision not found.", { status: 404 });
	if (target.ownerId !== access.identity.user.id) requireOwner(access.role);
	await getDb()
		.update(decision)
		.set({
			status: "resolved",
			resolution,
			resolvedById: access.identity.user.id,
			resolvedAt: new Date(),
		})
		.where(eq(decision.id, target.id));
	return approveWhenReady(access.plan);
}

export async function approveCurrentVersion(request: Request, planId: string) {
	const access = await requireWritablePlanAccess(request, planId);
	if (!access.plan.currentVersionId) throw new Response("The plan has no current version.", { status: 400 });
	await getDb()
		.insert(approval)
		.values({
			id: crypto.randomUUID(),
			planId,
			versionId: access.plan.currentVersionId,
			userId: access.identity.user.id,
		})
		.onConflictDoNothing();
	return approveWhenReady(access.plan);
}

export async function advancePlanStatus(request: Request, planId: string) {
	const access = await requireWritablePlanAccess(request, planId);
	requireOwner(access.role);
	const next = NEXT_STATUS[access.plan.status];
	if (!next) return { status: access.plan.status, reason: "Archived is the final lifecycle state." };
	if (next === "approved") {
		const gate = await approvalGate(access.plan);
		if (!gate.allowed) return { status: access.plan.status, reason: gate.reason };
	}
	await getDb().update(plan).set({ status: next, updatedAt: new Date() }).where(eq(plan.id, planId));
	return { status: next, reason: null };
}
