import "server-only";
import { diff, lint, normalize, type Block, type LintReport } from "@plantifiles/core";
import { db } from "@plantifiles/db";
import { DecisionStatus, Prisma } from "@plantifiles/db/client";
import { config } from "@/lib/config";

export type PublishPlanInput = {
  actorId: string;
  workspaceSlug?: string;
  planId?: string;
  slug?: string;
  title: string;
  source: string;
  agentName?: string;
  agentPrompt?: string;
  force?: boolean;
  baseVersion?: number;
};

export class PublishError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "plan"
  );
}

async function generateProseSummary(summary: string, changes: ReturnType<typeof diff>["changes"]): Promise<string | null> {
  if (!config.anthropicApiKey || changes.length === 0) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 180,
        messages: [
          {
            role: "user",
            content: `Summarize this plan's structural changes in two concise sentences. Do not invent context.\n\n${summary}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("content" in payload) || !Array.isArray(payload.content)) return null;
    const first = payload.content[0];
    if (!first || typeof first !== "object" || !("text" in first) || typeof first.text !== "string") return null;
    return first.text.trim() || null;
  } catch {
    return null;
  }
}

function lintJson(report: LintReport): Prisma.InputJsonValue {
  return {
    errors: report.errors,
    warnings: report.warnings,
    score: report.score,
    readTimeMinutes: report.readTimeMinutes,
    canPublish: report.canPublish,
    findings: report.findings.map((finding) => ({ ...finding })),
  };
}

function blockRows(blocks: Block[]) {
  return blocks.map((block) => ({
    key: block.key,
    kind: block.kind,
    ordinal: block.ordinal,
    contentHash: block.contentHash,
  }));
}

export async function publishPlan(input: PublishPlanInput) {
  const report = lint(input.source);
  if (!input.force && !report.canPublish) {
    throw new PublishError("Plan source failed lint.", 422, report);
  }
  const blocks = normalize(input.source);
  const decisionKeys = blocks.filter((block) => block.kind === "Decision").map((block) => block.key);

  if (!input.planId) {
    if (!input.workspaceSlug) throw new PublishError("workspaceSlug is required when creating a plan.", 400);
    const workspace = await db.workspace.findUnique({
      where: { slug: input.workspaceSlug },
      select: { id: true, memberships: { where: { userId: input.actorId }, select: { id: true } } },
    });
    if (!workspace || workspace.memberships.length === 0) throw new PublishError("Workspace not found.", 404);

    const planSlug = input.slug ? slugify(input.slug) : slugify(input.title);
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          workspaceId: workspace.id,
          slug: planSlug,
          title: input.title,
          createdById: input.actorId,
        },
        select: { id: true, slug: true, workspace: { select: { slug: true } } },
      });
      const version = await tx.planVersion.create({
        data: {
          planId: plan.id,
          number: 1,
          source: input.source,
          lintScore: report.score,
          lintReport: lintJson(report),
          lintOverridden: Boolean(input.force && !report.canPublish),
          authorId: input.actorId,
          agentName: input.agentName ?? null,
          agentPrompt: input.agentPrompt ?? null,
          blocks: { createMany: { data: blockRows(blocks) } },
        },
        select: { id: true, number: true, changeSummary: true, lintScore: true, lintOverridden: true },
      });
      if (decisionKeys.length > 0) {
        await tx.decision.createMany({ data: decisionKeys.map((key) => ({ planId: plan.id, key })) });
      }
      await tx.plan.update({ where: { id: plan.id }, data: { currentVersionId: version.id }, select: { id: true } });
      return { plan, version, url: `${config.baseUrl}/p/${plan.workspace.slug}/${plan.slug}` };
    });
  }

  const existing = await db.plan.findUnique({
    where: { id: input.planId },
    select: {
      id: true,
      slug: true,
      workspaceId: true,
      workspace: { select: { slug: true } },
      currentVersion: { select: { id: true, number: true, source: true } },
      decisions: { select: { key: true, status: true } },
    },
  });
  if (!existing?.currentVersion) throw new PublishError("Plan not found.", 404);
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: input.actorId, workspaceId: existing.workspaceId } },
    select: { id: true },
  });
  if (!membership) throw new PublishError("Plan not found.", 404);
  if (input.baseVersion !== undefined && input.baseVersion !== existing.currentVersion.number) {
    throw new PublishError(`Version ${existing.currentVersion.number} landed while you were editing.`, 409, {
      currentVersion: existing.currentVersion.number,
    });
  }

  const structuralDiff = diff(normalize(existing.currentVersion.source), blocks);
  const changeSummaryProse = await generateProseSummary(structuralDiff.summary, structuralDiff.changes);
  const versionNumber = existing.currentVersion.number + 1;
  const knownDecisionKeys = new Set(existing.decisions.map((decision) => decision.key));

  return db.$transaction(async (tx) => {
    const version = await tx.planVersion.create({
      data: {
        planId: existing.id,
        number: versionNumber,
        source: input.source,
        changeSummary: structuralDiff.summary,
        changeSummaryProse,
        lintScore: report.score,
        lintReport: lintJson(report),
        lintOverridden: Boolean(input.force && !report.canPublish),
        authorId: input.actorId,
        agentName: input.agentName ?? null,
        agentPrompt: input.agentPrompt ?? null,
        blocks: { createMany: { data: blockRows(blocks) } },
      },
      select: { id: true, number: true, changeSummary: true, lintScore: true, lintOverridden: true },
    });
    const newDecisionKeys = decisionKeys.filter((key) => !knownDecisionKeys.has(key));
    if (newDecisionKeys.length > 0) {
      await tx.decision.createMany({
        data: newDecisionKeys.map((key) => ({ planId: existing.id, key, status: DecisionStatus.OPEN })),
      });
    }
    await tx.plan.update({
      where: { id: existing.id },
      data: { title: input.title, currentVersionId: version.id },
      select: { id: true },
    });
    return {
      plan: { id: existing.id, slug: existing.slug, workspace: existing.workspace },
      version,
      url: `${config.baseUrl}/p/${existing.workspace.slug}/${existing.slug}`,
    };
  });
}
