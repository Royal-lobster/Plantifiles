import { type Block, diff, type LintReport, lint, normalize } from "@plantifiles/core";
import {
	approval,
	comment,
	decision,
	membership,
	plan,
	planBlock,
	planVersion,
	user,
	workspace,
} from "@plantifiles/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { authenticateRequest, requireIdentity } from "./request-auth.server";
import { getDb, getRuntimeEnv } from "./runtime.server";

const MAX_SOURCE_BYTES = 1_000_000;

export type PublishPlanInput = {
	workspaceSlug: string;
	slug?: string | undefined;
	title: string;
	source: string;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
};

export type PublishVersionInput = {
	source: string;
	agentName?: string | undefined;
	agentPrompt?: string | undefined;
	force?: boolean | undefined;
	baseVersion?: number | undefined;
};
export type PlanComment = typeof comment.$inferSelect & {
	author: { id: string; name: string; image: string | null };
};

export type PlanDocument = {
	plan: typeof plan.$inferSelect;
	workspace: typeof workspace.$inferSelect;
	version: typeof planVersion.$inferSelect;
	author: typeof user.$inferSelect;
	blocks: Block[];
	decisions: Array<typeof decision.$inferSelect>;
	approvals: Array<typeof approval.$inferSelect>;
	comments: PlanComment[];
};

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}

function assertPublishableSource(source: string, force = false): { blocks: Block[]; report: LintReport } {
	if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
		throw new Response("Plan source exceeds the 1 MB v1 limit.", { status: 413 });
	}
	const report = lint(source);
	if (!force && !report.canPublish) {
		throw Response.json({ error: "lint_failed", report }, { status: 422 });
	}
	return { blocks: normalize(source), report };
}

async function assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
	const rows = await getDb()
		.select({ id: membership.id })
		.from(membership)
		.where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
		.limit(1);
	if (!rows[0]) throw new Response("Forbidden", { status: 403 });
}

function blockStatements(blocks: Block[], versionId: string): D1PreparedStatement[] {
	const { DB } = getRuntimeEnv();
	return blocks.map((block) =>
		DB.prepare(
			"insert into plan_block (id, version_id, key, kind, ordinal, content_hash) values (?, ?, ?, ?, ?, ?)",
		).bind(crypto.randomUUID(), versionId, block.key, block.kind, block.ordinal, block.contentHash),
	);
}

function decisionStatements(blocks: Block[], planId: string): D1PreparedStatement[] {
	const { DB } = getRuntimeEnv();
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

function publicPlanUrl(workspaceSlug: string, planSlug: string): string {
	return `${getRuntimeEnv().PUBLIC_URL.replace(/\/$/, "")}/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}`;
}

export async function createPlan(request: Request, input: PublishPlanInput) {
	const identity = await requireIdentity(request);
	const db = getDb();
	const workspaceRow = await db.select().from(workspace).where(eq(workspace.slug, input.workspaceSlug)).limit(1);
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

	const { blocks, report } = assertPublishableSource(input.source, input.force);
	const planId = crypto.randomUUID();
	const versionId = crypto.randomUUID();
	const runtime = getRuntimeEnv();
	const statements: D1PreparedStatement[] = [
		runtime.DB.prepare(
			"insert into plan (id, workspace_id, slug, title, status, visibility, created_by_id, current_version_id, updated_at) values (?, ?, ?, ?, 'draft', 'workspace', ?, ?, unixepoch())",
		).bind(planId, targetWorkspace.id, planSlug, input.title, identity.user.id, versionId),
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
		url: publicPlanUrl(targetWorkspace.slug, planSlug),
		changeSummary: null,
		lint: report,
	};
}

async function generateProseSummary(summary: string): Promise<string | null> {
	const apiKey = getRuntimeEnv().ANTHROPIC_API_KEY;
	if (!apiKey) return null;
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: "claude-sonnet-4-5",
			max_tokens: 180,
			messages: [
				{
					role: "user",
					content: `Summarize this structural plan change in one concise paragraph. Do not invent details.\n\n${summary}`,
				},
			],
		}),
	});
	if (!response.ok) return null;
	const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
	return payload.content?.find((item) => item.type === "text")?.text?.trim() || null;
}

export async function createPlanVersion(request: Request, planId: string, input: PublishVersionInput) {
	const identity = await requireIdentity(request);
	const db = getDb();
	const rows = await db
		.select({ plan, workspace, version: planVersion })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.where(eq(plan.id, planId))
		.limit(1);
	const current = rows[0];
	if (!current) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(current.workspace.id, identity.user.id);
	if (input.baseVersion !== undefined && input.baseVersion !== current.version.number) {
		throw Response.json(
			{
				error: "version_conflict",
				message: `Version ${current.version.number} landed while you were editing version ${input.baseVersion}.`,
				currentVersion: current.version.number,
			},
			{ status: 409 },
		);
	}

	const { blocks, report } = assertPublishableSource(input.source, input.force);
	const structural = diff(normalize(current.version.source), blocks);
	const changeSummaryProse = await generateProseSummary(structural.summary);
	const versionId = crypto.randomUUID();
	const versionNumber = current.version.number + 1;
	const runtime = getRuntimeEnv();
	const statements: D1PreparedStatement[] = [
		runtime.DB.prepare(
			"insert into plan_version (id, plan_id, number, source, change_summary, change_summary_prose, lint_score, lint_report, lint_overridden, author_id, agent_name, agent_prompt, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())",
		).bind(
			versionId,
			planId,
			versionNumber,
			input.source,
			structural.summary,
			changeSummaryProse,
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
			"update plan set current_version_id = ?, status = case when status in ('approved', 'building', 'shipped') then 'in_review' else status end, updated_at = unixepoch() where id = ?",
		).bind(versionId, planId),
	];
	await runtime.DB.batch(statements);

	return {
		id: planId,
		version: versionNumber,
		url: publicPlanUrl(current.workspace.slug, current.plan.slug),
		changeSummary: structural.summary,
		changeSummaryProse,
		lint: report,
	};
}

export async function getPlanById(request: Request, planId: string) {
	const identity = await requireIdentity(request);
	const db = getDb();
	const rows = await db
		.select({ plan, workspace, version: planVersion, author: user })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(eq(plan.id, planId))
		.limit(1);
	const result = rows[0];
	if (!result) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(result.workspace.id, identity.user.id);
	return result;
}

export async function listPlans(request: Request, workspaceSlug: string, status?: string) {
	const identity = await requireIdentity(request);
	const db = getDb();
	const workspaceRows = await db.select().from(workspace).where(eq(workspace.slug, workspaceSlug)).limit(1);
	const targetWorkspace = workspaceRows[0];
	if (!targetWorkspace) throw new Response("Workspace not found", { status: 404 });
	await assertWorkspaceAccess(targetWorkspace.id, identity.user.id);

	const statusValues = ["draft", "in_review", "approved", "building", "shipped", "archived"] as const;
	const statusValue = statusValues.find((value) => value === status);
	return db
		.select({
			id: plan.id,
			slug: plan.slug,
			title: plan.title,
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
			requiredApprovals: sql<number>`${targetWorkspace.requiredApprovals}`,
			readTimeMinutes: sql<number>`coalesce(json_extract(${planVersion.lintReport}, '$.readTimeMinutes'), 0)`,
			authorName: user.name,
		})
		.from(plan)
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(
			statusValue
				? and(eq(plan.workspaceId, targetWorkspace.id), eq(plan.status, statusValue))
				: eq(plan.workspaceId, targetWorkspace.id),
		)
		.orderBy(desc(plan.updatedAt));
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
		.select({ plan, workspace })
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.where(
			and(eq(workspace.slug, workspaceSlug), sql`(${plan.slug} = ${planSlug} or ${plan.publicSlug} = ${planSlug})`),
		)
		.limit(1);
	const target = baseRows[0];
	if (!target) throw new Response("Plan not found", { status: 404 });

	if (target.plan.visibility !== "public") {
		const identity = await authenticateRequest(request);
		if (!identity) throw new Response("Unauthorized", { status: 401 });
		await assertWorkspaceAccess(target.workspace.id, identity.user.id);
	}

	const versions = await db
		.select({ version: planVersion, author: user })
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
			.select({ comment, author: user })
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
			...item,
			author: { id: author.id, name: author.name, image: author.image },
		})),
	};
}
export type PlanReaderVersion = {
	id: string;
	number: number;
	agentName: string | null;
	agentPrompt: string | null;
	changeSummary: string | null;
	changeSummaryProse: string | null;
	createdAt: Date;
	author: { id: string; name: string; image: string | null };
	blocks: Block[];
};

export async function loadPlanReaderData(
	request: Request,
	workspaceSlug: string,
	requestedSlug: string,
	versionNumber?: number,
): Promise<{
	document: PlanDocument;
	versions: PlanReaderVersion[];
	viewer: { id: string; name: string; image: string | null } | null;
}> {
	const document = await loadPlanDocument(request, workspaceSlug, requestedSlug, versionNumber);
	const identity = await authenticateRequest(request);
	const rows = await getDb()
		.select({ version: planVersion, author: user })
		.from(planVersion)
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(eq(planVersion.planId, document.plan.id))
		.orderBy(desc(planVersion.number));
	return {
		document,
		versions: rows.map(({ version, author }) => ({
			id: version.id,
			number: version.number,
			agentName: version.agentName,
			agentPrompt: version.agentPrompt,
			changeSummary: version.changeSummary,
			changeSummaryProse: version.changeSummaryProse,
			createdAt: version.createdAt,
			author: { id: author.id, name: author.name, image: author.image },
			blocks: normalize(version.source),
		})),
		viewer: identity ? { id: identity.user.id, name: identity.user.name, image: identity.user.image } : null,
	};
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

export function renderPlanMarkdown(document: PlanDocument): string {
	const openDecisions = document.decisions.filter((item) => item.status === "open").length;
	const canonicalUrl = publicPlanUrl(document.workspace.slug, document.plan.slug);
	const sourceWithoutFrontmatter = document.version.source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	return [
		"---",
		`title: ${yamlString(document.plan.title)}`,
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
	const identity = await requireIdentity(request);
	const db = getDb();
	const planRows = await db.select().from(plan).where(eq(plan.id, planId)).limit(1);
	const target = planRows[0];
	if (!target) throw new Response("Plan not found", { status: 404 });
	await assertWorkspaceAccess(target.workspaceId, identity.user.id);
	return db
		.select({ version: planVersion, author: user })
		.from(planVersion)
		.innerJoin(user, eq(planVersion.authorId, user.id))
		.where(eq(planVersion.planId, planId))
		.orderBy(desc(planVersion.number));
}

export async function getBlocksForVersions(versionIds: string[]) {
	if (versionIds.length === 0) return [];
	return getDb().select().from(planBlock).where(inArray(planBlock.versionId, versionIds));
}
