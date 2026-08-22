import { analyzePlan, type Block, diff, normalize, type PlanAnalysis } from "@plantifiles/core";
import { plan, planVersion, workspace } from "@plantifiles/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { assertWorkspaceAccess, publicPlanUrl } from "./plan-access.server";
import { resolvePlanEmoji } from "#/lib/helpers/plan-emoji";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getBindings, getDb } from "#/lib/integrations/runtime.server";

const MAX_SOURCE_BYTES = 1_000_000;

export type PublishPlanInput = {
	workspaceSlug: string;
	slug?: string | undefined;
	title: string;
	source: string;
	emoji?: string | undefined;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
};

export type PublishVersionInput = {
	source: string;
	emoji?: string | undefined;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
};

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}

function assertPublishableSource(source: string, emoji: string | null, force = false): PlanAnalysis {
	if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
		throw new Response("Plan source exceeds the 1 MB v1 limit.", { status: 413 });
	}
	const analysis = analyzePlan(source, { emoji: emoji ?? undefined });
	if (!analysis.canPersist || (!force && !analysis.report.canPublish)) {
		throw Response.json({ error: "lint_failed", report: analysis.report }, { status: 422 });
	}
	return analysis;
}

function blockStatements(blocks: Block[], versionId: string): D1PreparedStatement[] {
	const { DB } = getBindings();
	return blocks.map((block) =>
		DB.prepare(
			"insert into plan_block (id, version_id, key, kind, ordinal, content_hash) values (?, ?, ?, ?, ?, ?)",
		).bind(crypto.randomUUID(), versionId, block.key, block.kind, block.ordinal, block.contentHash),
	);
}

function decisionStatements(blocks: Block[], planId: string): D1PreparedStatement[] {
	const { DB } = getBindings();
	return blocks
		.filter((block) => block.kind === "Decision")
		.map((block) =>
			DB.prepare("insert or ignore into decision (id, plan_id, key, status) values (?, ?, ?, 'open')").bind(
				crypto.randomUUID(),
				planId,
				block.key,
			),
		);
}

export async function createPlan(request: Request, input: PublishPlanInput) {
	const identity = await requireIdentity(request, "plantifiles:write");
	const db = getDb();
	const workspaceRow = await db
		.select()
		.from(workspace)
		.where(and(eq(workspace.slug, input.workspaceSlug), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const targetWorkspace = workspaceRow[0];
	if (!targetWorkspace) throw new Response("Workspace not found", { status: 404 });
	await assertWorkspaceAccess(targetWorkspace.id, identity.user.id);

	const planSlug = input.slug ? slugify(input.slug) : slugify(input.title);
	if (!planSlug) throw new Response("Plan slug is empty.", { status: 400 });
	const existing = await db
		.select({ id: plan.id })
		.from(plan)
		.where(and(eq(plan.workspaceId, targetWorkspace.id), eq(plan.slug, planSlug)))
		.limit(1);
	if (existing[0]) throw new Response("A plan with this slug already exists.", { status: 409 });

	const emoji = resolvePlanEmoji(input.source, input.emoji);
	const { blocks, report } = assertPublishableSource(input.source, emoji, input.force);
	const planId = crypto.randomUUID();
	const versionId = crypto.randomUUID();
	const runtime = getBindings();
	const statements: D1PreparedStatement[] = [
		runtime.DB.prepare(
			"insert into plan (id, workspace_id, slug, title, emoji, status, visibility, created_by_id, current_version_id, updated_at) values (?, ?, ?, ?, ?, 'draft', 'workspace', ?, ?, unixepoch())",
		).bind(planId, targetWorkspace.id, planSlug, input.title, emoji, identity.user.id, versionId),
		runtime.DB.prepare(
			"insert into plan_version (id, plan_id, number, source, lint_score, lint_report, lint_overridden, author_id, agent_name, agent_prompt, created_at) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, unixepoch())",
		).bind(
			versionId,
			planId,
			input.source,
			report.score,
			JSON.stringify(report),
			input.force ? 1 : 0,
			identity.user.id,
			input.agentName ?? null,
			input.agentPrompt ?? null,
		),
		...blockStatements(blocks, versionId),
		...decisionStatements(blocks, planId),
	];
	await runtime.DB.batch(statements);

	return {
		id: planId,
		version: 1,
		url: await publicPlanUrl(targetWorkspace.slug, planSlug),
		changeSummary: null,
		lint: report,
	};
}

export async function createPlanVersion(request: Request, planId: string, input: PublishVersionInput) {
	const identity = await requireIdentity(request, "plantifiles:write");
	const db = getDb();
	const rows = await db
		.select({ plan, workspace, version: planVersion })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.where(and(eq(plan.id, planId), isNotNull(workspace.clerkOrganizationId)))
		.limit(1);
	const current = rows[0];
	if (!current) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(current.workspace.id, identity.user.id);

	const emoji = resolvePlanEmoji(input.source, input.emoji, current.plan.emoji);
	const { blocks, report } = assertPublishableSource(input.source, emoji, input.force);
	const structural = diff(normalize(current.version.source), blocks);
	const versionId = crypto.randomUUID();
	const versionNumber = current.version.number + 1;
	const runtime = getBindings();
	const statements: D1PreparedStatement[] = [
		runtime.DB.prepare(
			"insert into plan_version (id, plan_id, number, source, change_summary, lint_score, lint_report, lint_overridden, author_id, agent_name, agent_prompt, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())",
		).bind(
			versionId,
			planId,
			versionNumber,
			input.source,
			structural.summary,
			report.score,
			JSON.stringify(report),
			input.force ? 1 : 0,
			identity.user.id,
			input.agentName ?? null,
			input.agentPrompt ?? null,
		),
		...blockStatements(blocks, versionId),
		...decisionStatements(blocks, planId),
		runtime.DB.prepare(
			"update plan set current_version_id = ?, emoji = ?, status = case when status in ('approved') then 'in_review' else status end, updated_at = unixepoch() where id = ?",
		).bind(versionId, emoji, planId),
	];
	await runtime.DB.batch(statements);

	return {
		id: planId,
		version: versionNumber,
		url: await publicPlanUrl(current.workspace.slug, current.plan.slug),
		changeSummary: structural.summary,
		lint: report,
	};
}
