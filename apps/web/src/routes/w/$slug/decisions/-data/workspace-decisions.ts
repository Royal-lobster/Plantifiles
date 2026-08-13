import { type Block, normalize } from "@plantifiles/core";
import { decision, membership, plan, planVersion, workspace } from "@plantifiles/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";
import type { PlanStatus } from "#/lib/data/plan-types";

type WorkspaceDecisionGroup = {
	plan: { id: string; slug: string; title: string; status: PlanStatus };
	decisions: Array<{ id: string; key: string; title: string }>;
};

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export const getWorkspaceDecisions = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string().min(1) }))
	.handler(async ({ data }): Promise<WorkspaceDecisionGroup[]> => {
		const identity = await requireIdentity(getRequest());
		const db = getDb();
		const authorizedWorkspaces = await db
			.select({ id: workspace.id })
			.from(workspace)
			.innerJoin(membership, eq(membership.workspaceId, workspace.id))
			.where(and(eq(workspace.slug, data.slug), eq(membership.userId, identity.user.id)))
			.limit(1);
		const authorizedWorkspace = authorizedWorkspaces[0];
		if (!authorizedWorkspace) throw new Response("Forbidden", { status: 403 });

		const rows = await db
			.select({
				decision: { id: decision.id, key: decision.key },
				plan: { id: plan.id, slug: plan.slug, title: plan.title, status: plan.status },
				source: planVersion.source,
			})
			.from(decision)
			.innerJoin(plan, eq(decision.planId, plan.id))
			.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
			.where(and(eq(plan.workspaceId, authorizedWorkspace.id), eq(decision.status, "open")));

		const blocksBySource = new Map<string, Map<string, Block>>();
		const groupsByPlan = new Map<
			string,
			{
				plan: WorkspaceDecisionGroup["plan"];
				decisions: Array<WorkspaceDecisionGroup["decisions"][number] & { ordinal: number }>;
			}
		>();
		for (const row of rows) {
			let blocks = blocksBySource.get(row.source);
			if (!blocks) {
				blocks = new Map(normalize(row.source).map((block) => [block.key, block]));
				blocksBySource.set(row.source, blocks);
			}
			const block = blocks.get(row.decision.key);
			let group = groupsByPlan.get(row.plan.id);
			if (!group) {
				group = { plan: row.plan, decisions: [] };
				groupsByPlan.set(row.plan.id, group);
			}
			group.decisions.push({
				id: row.decision.id,
				key: row.decision.key,
				title: block?.title ?? row.decision.key,
				ordinal: block?.ordinal ?? Number.MAX_SAFE_INTEGER,
			});
		}

		return [...groupsByPlan.values()]
			.sort(
				(left, right) =>
					compareText(left.plan.title, right.plan.title) ||
					compareText(left.plan.slug, right.plan.slug) ||
					compareText(left.plan.id, right.plan.id),
			)
			.map(({ plan: groupPlan, decisions: groupDecisions }) => ({
				plan: groupPlan,
				decisions: groupDecisions
					.sort(
						(left, right) =>
							left.ordinal - right.ordinal || compareText(left.key, right.key) || compareText(left.id, right.id),
					)
					.map((item) => ({ id: item.id, key: item.key, title: item.title })),
			}));
	});
