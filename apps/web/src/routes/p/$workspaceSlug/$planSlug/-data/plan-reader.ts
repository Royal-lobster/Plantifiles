import { analyzePlan, type LintReport } from "@plantifiles/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { loadPlanReaderData } from "../../../../../lib/data/plan-reader.server";
import { compilePlan } from "./compile-plan.server";

const planParamsSchema = z.object({
	workspaceSlug: z.string(),
	planSlug: z.string(),
	number: z.coerce.number().int().positive().optional(),
});

export const getPlanReaderData = createServerFn({ method: "GET" })
	.validator(planParamsSchema)
	.handler(async ({ data }) => {
		const { document, versions, viewer } = await loadPlanReaderData(
			getRequest(),
			data.workspaceSlug,
			data.planSlug,
			data.number,
		);
		const analysis = analyzePlan(document.version.source, { emoji: document.plan.emoji ?? undefined });
		const renderTree = await compilePlan(document.version.source);
		return {
			plan: {
				id: document.plan.id,
				slug: document.plan.slug,
				title: document.plan.title,
				emoji: document.plan.emoji,
				status: document.plan.status,
			},
			metadata: analysis.metadata,
			workspace: { slug: document.workspace.slug },
			version: {
				number: document.version.number,
				lintReport: document.version.lintReport as LintReport,
			},
			blocks: document.blocks.map(({ key, kind, contentHash }) => ({ key, kind, contentHash })),
			comments: document.comments.map((item) => ({
				id: item.id,
				versionId: item.versionId,
				blockKey: item.blockKey,
				parentId: item.parentId,
				body: item.body,
				agentAssisted: item.agentAssisted,
				resolvedAt: item.resolvedAt?.toISOString() ?? null,
				createdAt: item.createdAt.toISOString(),
				author: {
					id: item.author.id,
					name: item.author.name,
					image: item.author.image,
				},
			})),
			decisions: document.decisions.map(({ key, status, resolution }) => ({ key, status, resolution })),
			renderTree,
			versions: versions.map((item) => ({
				id: item.id,
				number: item.number,
				agentName: item.agentName,
				agentPrompt: item.agentPrompt,
				changeSummary: item.changeSummary,
				createdAt: item.createdAt.toISOString(),
				author: item.author,
			})),
			viewer,
		};
	});

export type PlanReaderData = Awaited<ReturnType<typeof getPlanReaderData>>;
