import type { MovedPlan, MovePlanInput, MoveTarget } from "@plantifiles/api-contract";
import { approval, type membership, plan, workspace } from "@plantifiles/db/schema";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { slugify } from "#/lib/helpers/plan-slug";
import { getBindings, getDb } from "#/lib/integrations/runtime.server";
import { assertWorkspaceAccess, publicPlanUrl, requireWritablePlanAccess } from "./plan-access.server";
import { listWorkspacesForUser } from "./workspaces.server";

type MembershipRole = typeof membership.$inferSelect.role;

/**
 * A destination collision is an expected outcome, not a fault: the caller picks
 * another slug and retries. Naming it lets the HTTP API answer 409 while the
 * page renders it beside the slug field, instead of every transport pattern
 * matching on a message.
 */
export class PlanSlugConflictError extends Error {
	readonly workspaceSlug: string;
	readonly slug: string;

	constructor(workspaceSlug: string, slug: string) {
		super(`${workspaceSlug} already has a plan at "${slug}". Choose a different slug.`);
		this.name = "PlanSlugConflictError";
		this.workspaceSlug = workspaceSlug;
		this.slug = slug;
	}
}

/**
 * A move takes the plan out of the organization that currently owns it, so only
 * the person who published it there may take it away — an organization owner
 * inherits review authority over a plan, not the right to relocate someone
 * else's. Membership still counts: an author who has left the organization no
 * longer speaks for its plans.
 */
export function canMovePlan(
	target: { createdById: string },
	viewer: { id: string } | null,
	role: MembershipRole | null,
): boolean {
	if (!viewer || !role) return false;
	return target.createdById === viewer.id;
}

async function requireMoveAccess(request: Request, planId: string) {
	const access = await requireWritablePlanAccess(request, planId);
	if (!canMovePlan(access.plan, access.identity.user, access.role)) {
		throw new Response("Only the author of a plan can move it to another organization.", { status: 403 });
	}
	return access;
}

/**
 * The organizations this plan can move into, each flagged with whether the slug
 * is already taken there. Reporting the collision up front is what keeps the
 * chooser from being a 409 generator.
 */
export async function listMoveTargets(request: Request, planId: string): Promise<MoveTarget[]> {
	const access = await requireMoveAccess(request, planId);
	const candidates = (await listWorkspacesForUser(access.identity.user)).filter(
		(item) => item.id !== access.plan.workspaceId,
	);
	if (candidates.length === 0) return [];
	const taken = await getDb()
		.select({ workspaceId: plan.workspaceId })
		.from(plan)
		.where(
			and(
				eq(plan.slug, access.plan.slug),
				inArray(
					plan.workspaceId,
					candidates.map((item) => item.id),
				),
			),
		);
	const takenIds = new Set(taken.map((row) => row.workspaceId));
	return candidates.map((item) => ({ ...item, slugTaken: takenIds.has(item.id) }));
}

export async function movePlan(request: Request, planId: string, input: MovePlanInput): Promise<MovedPlan> {
	const access = await requireMoveAccess(request, planId);
	const db = getDb();
	const destinationRows = await db
		.select()
		.from(workspace)
		.where(and(eq(workspace.slug, input.workspaceSlug), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const destination = destinationRows[0];
	if (!destination) throw new Response("Destination organization not found", { status: 404 });

	const slug = input.slug ? slugify(input.slug) : access.plan.slug;
	if (!slug) throw new Response("Plan slug is empty.", { status: 400 });

	if (destination.id === access.plan.workspaceId) {
		// `plantifiles move` gets retried after a dropped response and re-run from
		// stale local state, so landing where the caller asked for is success. A
		// slug change is not part of that idempotency, and moving is not renaming.
		if (slug !== access.plan.slug) {
			throw new Response(`The plan is already in ${destination.slug}; moving cannot rename it.`, { status: 400 });
		}
		return {
			id: access.plan.id,
			workspaceSlug: destination.slug,
			slug: access.plan.slug,
			url: await publicPlanUrl(destination.slug, access.plan.slug),
			status: access.plan.status,
			movedFrom: null,
			clearedApprovals: 0,
		};
	}
	// Arriving in an organization is the same privilege as publishing into it.
	await assertWorkspaceAccess(destination.id, access.identity.user.id);

	const collision = await db
		.select({ id: plan.id })
		.from(plan)
		.where(and(eq(plan.workspaceId, destination.id), eq(plan.slug, slug)))
		.limit(1);
	if (collision[0]) throw new PlanSlugConflictError(destination.slug, slug);

	// Approvals belong to the organization that granted them: whoever approved the
	// current version inside the old organization said nothing about this plan
	// living in the new one, and the approval gate only counts rows. Left in
	// place, they would let a plan arrive pre-approved by people who cannot read
	// it. Older versions keep their approvals as history; the gate never reads
	// them. `approved` demotes for the same reason.
	const currentVersionId = access.plan.currentVersionId;
	const approvalRows = currentVersionId
		? await db.select({ count: count() }).from(approval).where(eq(approval.versionId, currentVersionId))
		: [];
	const clearedApprovals = approvalRows[0]?.count ?? 0;

	const runtime = getBindings();
	const statements: D1PreparedStatement[] = [
		runtime.DB.prepare(
			"update plan set workspace_id = ?, slug = ?, status = case when status = 'approved' then 'in_review' else status end, updated_at = unixepoch() where id = ?",
		).bind(destination.id, slug, access.plan.id),
	];
	if (currentVersionId) {
		statements.push(
			runtime.DB.prepare("delete from approval where plan_id = ? and version_id = ?").bind(
				access.plan.id,
				currentVersionId,
			),
		);
	}
	await runtime.DB.batch(statements);

	return {
		id: access.plan.id,
		workspaceSlug: destination.slug,
		slug,
		url: await publicPlanUrl(destination.slug, slug),
		status: access.plan.status === "approved" ? "in_review" : access.plan.status,
		movedFrom: access.workspace.slug,
		clearedApprovals,
	};
}
