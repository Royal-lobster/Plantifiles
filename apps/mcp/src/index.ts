#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { ApiError, PlantifilesApi } from "./api.js";

function requiredEnvironment(name: "PLANTIFILES_TOKEN" | "PLANTIFILES_BASE_URL"): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function toolError(caught: unknown) {
	const message = caught instanceof Error ? caught.message : String(caught);
	const detail = caught instanceof ApiError ? `\n${JSON.stringify(caught.body, null, 2)}` : "";
	return { isError: true as const, content: [{ type: "text" as const, text: `${message}${detail}` }] };
}

function textResult(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function main() {
	const api = new PlantifilesApi({
		token: requiredEnvironment("PLANTIFILES_TOKEN"),
		baseUrl: requiredEnvironment("PLANTIFILES_BASE_URL").replace(/\/$/, ""),
	});
	const server = new McpServer({ name: "plantifiles", version: "0.1.0" });

	server.registerTool(
		"create_plan",
		{
			description: "Publish a new linted Plantifiles plan and return its canonical URL.",
			inputSchema: z.object({
				workspaceSlug: z.string().min(1),
				slug: z.string().min(1).optional(),
				title: z.string().min(1),
				source: z.string(),
				agentName: z.string().min(1).optional(),
				agentPrompt: z.string().optional(),
				force: z.boolean().optional(),
			}),
		},
		async (input) => {
			try {
				return textResult(await api.createPlan(input));
			} catch (caught) {
				return toolError(caught);
			}
		},
	);

	server.registerTool(
		"update_plan",
		{
			description: "Publish a new version of an existing Plantifiles plan.",
			inputSchema: z.object({
				planId: z.string().min(1),
				source: z.string(),
				agentName: z.string().min(1).optional(),
				agentPrompt: z.string().optional(),
				force: z.boolean().optional(),
			}),
		},
		async ({ planId, ...input }) => {
			try {
				return textResult(await api.updatePlan(planId, input));
			} catch (caught) {
				return toolError(caught);
			}
		},
	);

	server.registerTool(
		"get_plan",
		{
			description: "Get the exact Markdown-with-frontmatter representation served by a plan URL.",
			inputSchema: z.object({ idOrUrl: z.string().min(1) }),
		},
		async ({ idOrUrl }) => {
			try {
				return { content: [{ type: "text" as const, text: await api.getPlanMarkdown(idOrUrl) }] };
			} catch (caught) {
				return toolError(caught);
			}
		},
	);

	server.registerTool(
		"list_plans",
		{
			description: "List plans and review state for a Plantifiles workspace.",
			inputSchema: z.object({ workspaceSlug: z.string().min(1), status: z.string().min(1).optional() }),
		},
		async ({ workspaceSlug, status }) => {
			try {
				return textResult(await api.listPlans(workspaceSlug, status));
			} catch (caught) {
				return toolError(caught);
			}
		},
	);

	server.registerTool(
		"comment_on_plan",
		{
			description: "Add an agent-assisted plan or block comment to the current plan version.",
			inputSchema: z.object({
				planId: z.string().min(1),
				body: z.string().trim().min(1).max(10_000),
				blockKey: z.string().min(1).optional(),
				parentId: z.string().min(1).optional(),
			}),
		},
		async ({ planId, ...input }) => {
			try {
				return textResult(await api.commentOnPlan(planId, input));
			} catch (caught) {
				return toolError(caught);
			}
		},
	);

	await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
