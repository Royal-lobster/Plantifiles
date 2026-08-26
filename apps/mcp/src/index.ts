#!/usr/bin/env node
import {
	commentInputSchema,
	listPlansInputSchema,
	movePlanInputSchema,
	planEmojiSchema,
	publishPlanInputSchema,
	publishVersionInputSchema,
} from "@plantifiles/api-contract";
import { resolveConnection } from "@plantifiles/auth";
import { ApiError, PlantifilesClient } from "@plantifiles/api-client";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function toolError(caught: unknown) {
	const message = caught instanceof Error ? caught.message : String(caught);
	const detail = caught instanceof ApiError ? `\n${JSON.stringify(caught.body, null, 2)}` : "";
	return { isError: true as const, content: [{ type: "text" as const, text: `${message}${detail}` }] };
}

async function runTool(
	operation: () => Promise<unknown>,
	serialize: (value: unknown) => string = (value) => JSON.stringify(value, null, 2) ?? "null",
) {
	try {
		return { content: [{ type: "text" as const, text: serialize(await operation()) }] };
	} catch (caught) {
		return toolError(caught);
	}
}

async function main() {
	const api = new PlantifilesClient(await resolveConnection());
	const server = new McpServer({ name: "plantifiles", version: "0.1.0" });

	server.registerTool(
		"create_plan",
		{
			description: "Publish a new linted Plantifiles plan and return its canonical URL.",
			inputSchema: publishPlanInputSchema.extend({
				emoji: planEmojiSchema
					.optional()
					.describe("Pick one representative emoji for the plan's subject, such as 🧾 for billing."),
			}),
		},
		(input) => runTool(() => api.createPlan(input)),
	);

	server.registerTool(
		"update_plan",
		{
			description: "Publish a new version of an existing Plantifiles plan.",
			inputSchema: publishVersionInputSchema.extend({
				planId: z.string().min(1),
				emoji: planEmojiSchema
					.optional()
					.describe("Pick one representative emoji for the plan's subject; it replaces the current emoji."),
			}),
		},
		({ planId, ...input }) => runTool(() => api.createVersion(planId, input)),
	);

	server.registerTool(
		"move_plan",
		{
			description:
				"Move a plan to a different organization, for when it was published to the wrong one. Approvals on the current version are cleared because they belonged to the previous organization.",
			inputSchema: movePlanInputSchema.extend({
				planId: z.string().min(1),
				workspaceSlug: z.string().min(1).describe("Slug of the organization the plan should end up in."),
				slug: z
					.string()
					.min(1)
					.optional()
					.describe("New plan slug; only needed when the destination already has a plan at the current slug."),
			}),
		},
		({ planId, ...input }) => runTool(() => api.movePlan(planId, input)),
	);

	server.registerTool(
		"get_plan",
		{
			description: "Get the exact Markdown-with-frontmatter representation served by a plan URL.",
			inputSchema: z.object({ idOrUrl: z.string().min(1) }),
		},
		({ idOrUrl }) => runTool(() => api.getPlanMarkdown(idOrUrl), String),
	);

	server.registerTool(
		"list_plans",
		{
			description: "List plans and review state for a Plantifiles workspace.",
			inputSchema: listPlansInputSchema,
		},
		(input) => runTool(() => api.listPlans(input)),
	);

	server.registerTool(
		"comment_on_plan",
		{
			description: "Add an agent-assisted plan or block comment to the current plan version.",
			inputSchema: commentInputSchema.extend({ planId: z.string().min(1) }),
		},
		({ planId, ...input }) => runTool(() => api.commentOnPlan(planId, input)),
	);

	await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
