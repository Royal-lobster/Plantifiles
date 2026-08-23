import { type Block, normalize } from "@plantifiles/core";
import { approval, comment, decision, plan, planVersion, user, workspace } from "@plantifiles/db/schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { authenticateRequest, requireIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";
import { assertWorkspaceAccess, publicPlanUrl } from "./plan-access.server";
import type { PlanStatus } from "./plan-types";

const authorSelection = {
	id: user.id,
	name: user.name,
	image: user.image,
};

const planSelection = {
	id: plan.id,
	workspaceId: plan.workspaceId,
	slug: plan.slug,
	title: plan.title,
	emoji: plan.emoji,
	status: plan.status,
	visibility: plan.visibility,
	publicSlug: plan.publicSlug,
	createdById: plan.createdById,
	currentVersionId: plan.currentVersionId,
	updatedAt: plan.updatedAt,
};

const workspaceSelection = {
	id: workspace.id,
	slug: workspace.slug,
	name: workspace.name,
};

const planVersionSelection = {
	id: planVersion.id,
	planId: planVersion.planId,
	number: planVersion.number,
	source: planVersion.source,
	changeSummary: planVersion.changeSummary,
	lintScore: planVersion.lintScore,
	lintReport: planVersion.lintReport,
	lintOverridden: planVersion.lintOverridden,
	authorId: planVersion.authorId,
	agentName: planVersion.agentName,
	agentPrompt: planVersion.agentPrompt,
	createdAt: planVersion.createdAt,
};

type PlanComment = typeof comment.$inferSelect & {
	author: { id: string; name: string; image: string | null };
};

export type PlanDocument = {
	plan: typeof plan.$inferSelect;
	workspace: { id: string; slug: string; name: string };
	version: typeof planVersion.$inferSelect;
	author: { id: string; name: string; image: string | null };
	blocks: Block[];
	decisions: Array<typeof decision.$inferSelect>;
	approvals: Array<typeof approval.$inferSelect>;
	comments: PlanComment[];
};

export async function getPlanById(request: Request, planId: string) {
	const identity = await requireIdentity(request, "plantifiles:read");
	const db = getDb();
	const rows = await db
		.select({
			plan: planSelection,
			workspace: workspaceSelection,
			version: planVersionSelection,
			author: authorSelection,
		})
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(and(eq(plan.id, planId), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const result = rows[0];
	if (!result) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(result.workspace.id, identity.user.id);
	return result;
}

export type PlanListItem = {
	id: string;
	slug: string;
	title: string;
	emoji: string | null;
	status: PlanStatus;
	updatedAt: Date;
	version: number;
	agentName: string | null;
	openDecisions: number;
	approvals: number;
	readTimeMinutes: number;
	authorName: string;
	mine: boolean;
	needsMyReview: boolean;
};

export async function listPlans(
	request: Request,
	workspaceSlug: string,
	status?: typeof plan.$inferSelect.status,
): Promise<PlanListItem[]> {
	const identity = await requireIdentity(request, "plantifiles:read");
	const db = getDb();
	const workspaceRows = await db
		.select()
		.from(workspace)
		.where(and(eq(workspace.slug, workspaceSlug), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const targetWorkspace = workspaceRows[0];
	if (!targetWorkspace) throw new Response("Workspace not found", { status: 404 });
	await assertWorkspaceAccess(targetWorkspace.id, identity.user.id);

	const viewerId = identity.user.id;
	const rows = await db
		.select({
			id: plan.id,
			slug: plan.slug,
			title: plan.title,
			emoji: plan.emoji,
			status: plan.status,
			updatedAt: plan.updatedAt,
			version: planVersion.number,
			agentName: planVersion.agentName,
			openDecisions: sql<number>`(
				select count(*) from decision d
				where d.plan_id = ${plan.id} and d.status = 'open'
			)`,
			approvals: sql<number>`(
				select count(*) from approval a
				where a.version_id = ${planVersion.id}
			)`,
			readTimeMinutes: sql<number>`coalesce(json_extract(${planVersion.lintReport}, '$.readTimeMinutes'), 0)`,
			authorName: user.name,
			createdById: plan.createdById,
			authorId: planVersion.authorId,
			approvedByMe: sql<number>`exists(
				select 1 from approval a
				where a.version_id = ${planVersion.id} and a.user_id = ${viewerId}
			)`,
		})
		.from(plan)
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(
			status
				? and(eq(plan.workspaceId, targetWorkspace.id), eq(plan.status, status))
				: eq(plan.workspaceId, targetWorkspace.id),
		)
		.orderBy(desc(plan.updatedAt));
	return rows.map(({ createdById, authorId, approvedByMe, ...item }) => {
		const mine = createdById === viewerId || authorId === viewerId;
		return {
			...item,
			mine,
			needsMyReview: item.status === "in_review" && !mine && !approvedByMe,
		};
	});
}

export async function loadPlanDocument(
	request: Request,
	workspaceSlug: string,
	requestedSlug: string,
	versionNumber?: number,
): Promise<PlanDocument> {
	const planSlug = requestedSlug.endsWith(".md") ? requestedSlug.slice(0, -3) : requestedSlug;
	const db = getDb();
	const baseRows = await db
		.select({ plan: planSelection, workspace: workspaceSelection })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.where(
			and(
				eq(workspace.slug, workspaceSlug),
				isNotNull(workspace.clerkOrganizationId),
				sql`(${plan.slug} = ${planSlug} or ${plan.publicSlug} = ${planSlug})`,
			),
		)
		.limit(1);
	const target = baseRows[0];
	if (!target) throw new Response("Plan not found", { status: 404 });

	if (target.plan.visibility !== "public") {
		const identity = await authenticateRequest(request, "plantifiles:read");
		if (!identity) throw new Response("Unauthorized", { status: 401 });
		await assertWorkspaceAccess(target.workspace.id, identity.user.id);
	}

	const versions = await db
		.select({ version: planVersionSelection, author: authorSelection })
		.from(planVersion)
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(
			versionNumber === undefined
				? eq(planVersion.id, target.plan.currentVersionId ?? "")
				: and(eq(planVersion.planId, target.plan.id), eq(planVersion.number, versionNumber)),
		)
		.limit(1);
	const selected = versions[0];
	if (!selected) throw new Response("Version not found", { status: 404 });

	const [decisions, approvals, commentRows] = await Promise.all([
		db.select().from(decision).where(eq(decision.planId, target.plan.id)).orderBy(asc(decision.key)),
		db.select().from(approval).where(eq(approval.versionId, selected.version.id)),
		db
			.select({ comment, author: authorSelection })
			.from(comment)
			.innerJoin(user, eq(comment.authorId, user.id))
			.where(eq(comment.planId, target.plan.id))
			.orderBy(asc(comment.createdAt)),
	]);
	return {
		plan: target.plan,
		workspace: target.workspace,
		version: selected.version,
		author: selected.author,
		blocks: normalize(selected.version.source),
		decisions,
		approvals,
		comments: commentRows.map(({ comment: item, author }) => ({
			id: item.id,
			planId: item.planId,
			versionId: item.versionId,
			blockKey: item.blockKey,
			parentId: item.parentId,
			body: item.body,
			authorId: item.authorId,
			agentAssisted: item.agentAssisted,
			resolvedAt: item.resolvedAt,
			createdAt: item.createdAt,
			author,
		})),
	};
}

export type PlanReaderVersion = {
	id: string;
	number: number;
	agentName: string | null;
	agentPrompt: string | null;
	changeSummary: string | null;
	createdAt: Date;
	author: { name: string };
};

const planReaderVersionSelection = {
	id: planVersion.id,
	number: planVersion.number,
	agentName: planVersion.agentName,
	agentPrompt: planVersion.agentPrompt,
	changeSummary: planVersion.changeSummary,
	createdAt: planVersion.createdAt,
};

export async function loadPlanReaderData(
	request: Request,
	workspaceSlug: string,
	requestedSlug: string,
	versionNumber?: number,
): Promise<{
	document: PlanDocument;
	versions: PlanReaderVersion[];
	viewer: { id: string } | null;
}> {
	const document = await loadPlanDocument(request, workspaceSlug, requestedSlug, versionNumber);
	const [identity, rows] = await Promise.all([
		authenticateRequest(request, "plantifiles:read"),
		getDb()
			.select({ version: planReaderVersionSelection, author: { name: user.name } })
			.from(planVersion)
			.innerJoin(user, eq(planVersion.authorId, user.id))
			.where(eq(planVersion.planId, document.plan.id))
			.orderBy(desc(planVersion.number)),
	]);
	return {
		document,
		versions: rows.map(({ version, author }) => ({ ...version, author })),
		viewer: identity ? { id: identity.user.id } : null,
	};
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

export async function renderPlanMarkdown(document: PlanDocument): Promise<string> {
	const openDecisions = document.decisions.filter((item) => item.status === "open").length;
	const canonicalUrl = await publicPlanUrl(document.workspace.slug, document.plan.slug);
	const sourceWithoutFrontmatter = document.version.source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	return [
		"---",
		`title: ${yamlString(document.plan.title)}`,
		...(document.plan.emoji ? [`emoji: ${yamlString(document.plan.emoji)}`] : []),
		`version: ${document.version.number}`,
		`status: ${yamlString(document.plan.status)}`,
		`url: ${yamlString(canonicalUrl)}`,
		`openDecisions: ${openDecisions}`,
		`updatedAt: ${yamlString(document.plan.updatedAt.toISOString())}`,
		"---",
		"",
		sourceWithoutFrontmatter,
	].join("\n");
}

export async function getVersionHistory(request: Request, planId: string) {
	const identity = await requireIdentity(request, "plantifiles:read");
	const db = getDb();
	const planRows = await db
		.select({ plan })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.where(and(eq(plan.id, planId), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const target = planRows[0]?.plan;
	if (!target) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(target.workspaceId, identity.user.id);
	return db
		.select({ version: planVersionSelection, author: authorSelection })
		.from(planVersion)
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(eq(planVersion.planId, planId))
		.orderBy(desc(planVersion.number));
}
