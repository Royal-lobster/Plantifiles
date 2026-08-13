#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { ApiError, type PlanStatus, PlantifilesClient } from "@plantifiles/api-client";
import { lint } from "@plantifiles/core";
import { CONFIG_PATH, resolveConnection, saveConfig } from "./config.js";
import { findRepositoryRoot, loadRepositoryState, saveRepositoryState, trackedPath } from "./repository-state.js";

type PushOptions = {
	workspace?: string;
	title?: string;
	agent?: string;
	prompt?: string;
	emoji?: string;
	force?: boolean;
};

type PullOptions = {
	output?: string;
};

type StatusOptions = {
	workspace?: string;
};

function titleFromSource(source: string, file: string): string {
	const frontmatterTitle = source.match(/^---\r?\n[\s\S]*?^title:\s*(.+?)\s*$[\s\S]*?^---$/m)?.[1];
	if (frontmatterTitle) return frontmatterTitle.replace(/^['"]|['"]$/g, "");
	const extension = extname(file);
	return basename(file, extension)
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function login(): Promise<void> {
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const configuredBaseUrl = process.env.PLANTIFILES_BASE_URL;
		const baseUrl = configuredBaseUrl ?? (await terminal.question("Plantifiles URL: "));
		if (!baseUrl.trim()) throw new Error("Plantifiles URL is required.");
		console.log(`Create a token at ${baseUrl.replace(/\/$/, "")}/settings/tokens`);
		const token = await terminal.question("Token: ");
		if (!token.trim()) throw new Error("Token is required.");
		await saveConfig({ token: token.trim(), baseUrl: baseUrl.trim().replace(/\/$/, "") });
		console.log(`Saved credentials to ${CONFIG_PATH} with mode 0600.`);
	} finally {
		terminal.close();
	}
}

async function push(file: string, options: PushOptions): Promise<void> {
	const absoluteFile = resolve(file);
	const source = await readFile(absoluteFile, "utf8");
	const root = findRepositoryRoot(process.cwd());
	const state = await loadRepositoryState(root);
	const key = trackedPath(root, absoluteFile);
	const tracked = state[key];
	const workspace = options.workspace ?? tracked?.workspace;
	if (!workspace) throw new Error("A first push requires --workspace <slug>.");

	const client = new PlantifilesClient(await resolveConnection());
	const result = tracked
		? await client.createVersion(tracked.planId, {
				source,
				emoji: options.emoji,
				agentName: options.agent,
				agentPrompt: options.prompt,
				force: options.force ?? false,
			})
		: await client.createPlan({
				workspaceSlug: workspace,
				title: options.title ?? titleFromSource(source, file),
				emoji: options.emoji,
				source,
				agentName: options.agent,
				agentPrompt: options.prompt,
				force: options.force ?? false,
			});
	state[key] = { planId: result.id, url: result.url, workspace };
	await saveRepositoryState(root, state);
	console.log(result.url);
	if (result.changeSummary) console.log(result.changeSummary);
}

async function pull(idOrUrl: string, options: PullOptions): Promise<void> {
	const detail = await new PlantifilesClient(await resolveConnection()).resolvePlan(idOrUrl);
	if (options.output) {
		await writeFile(resolve(options.output), detail.version.source, "utf8");
		console.log(`Wrote ${options.output}`);
		return;
	}
	process.stdout.write(detail.version.source);
}

async function lintFile(file: string): Promise<void> {
	const report = lint(await readFile(resolve(file), "utf8"));
	for (const finding of report.findings) {
		console.log(`${file}:${finding.line} ${finding.rule} ${finding.message}`);
	}
	console.log(`score ${report.score}`);
	console.log(`errors ${report.errors} warnings ${report.warnings}`);
	if (report.errors > 0) process.exitCode = 1;
}

function openUrl(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.unref();
}

async function openPlan(id: string): Promise<void> {
	const config = await resolveConnection();
	const detail = await new PlantifilesClient(config).getPlan(id);
	openUrl(`${config.baseUrl}/p/${encodeURIComponent(detail.workspace.slug)}/${encodeURIComponent(detail.plan.slug)}`);
}

function renderStatusTable(plans: PlanStatus[]): string {
	const rows = [
		["TITLE", "STATUS", "VER", "DECISIONS", "APPROVALS", "READ", "AGENT"],
		...plans.map((plan) => [
			plan.title,
			plan.status,
			`v${plan.version}`,
			String(plan.openDecisions),
			`${plan.approvals}/${plan.requiredApprovals}`,
			`${Math.max(1, Math.ceil(plan.readTimeMinutes))}m`,
			plan.agentName ?? "hand edit",
		]),
	];
	const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
	return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")).join("\n");
}

async function status(options: StatusOptions): Promise<void> {
	let workspace = options.workspace;
	if (!workspace) {
		const root = findRepositoryRoot(process.cwd());
		workspace = Object.values(await loadRepositoryState(root))[0]?.workspace;
	}
	if (!workspace) throw new Error("Use --workspace <slug> before a plan has been tracked in this repository.");
	const plans = await new PlantifilesClient(await resolveConnection()).listPlans(workspace);
	console.log(plans.length > 0 ? renderStatusTable(plans) : `No plans in ${workspace}.`);
}

async function main(): Promise<void> {
	const program = new Command()
		.name("plantifiles")
		.description("Publish, review, and retrieve Plantifiles plans")
		.showHelpAfterError();
	program.action(() => program.outputHelp());

	program.command("login").description("Save an API token").action(login);

	program
		.command("push")
		.description("Publish a plan or create its next version")
		.argument("<file>", "plan file to publish")
		.option("--workspace <slug>", "workspace for the first push")
		.option("--title <title>", "plan title; defaults to frontmatter or filename")
		.option("--agent <name>", "agent that authored the plan")
		.option("--prompt <prompt>", "prompt used to author the plan")
		.option("--emoji <character>", "representative emoji for the plan")
		.option("--force", "publish even when lint errors are present")
		.action(push);

	program
		.command("pull")
		.description("Fetch byte-identical plan source")
		.argument("<id-or-url>", "plan ID or URL")
		.option("-o, --output <file>", "write source to a file instead of stdout")
		.action(pull);

	program
		.command("lint")
		.description("Lint a plan locally")
		.argument("<file>", "plan file to lint")
		.addHelpText(
			"after",
			"\nOutput includes each line finding, the score, and error/warning counts.\nLint exits nonzero only when errors are present.",
		)
		.action(lintFile);

	program.command("open").description("Open a plan in the browser").argument("<id>", "plan ID").action(openPlan);

	program
		.command("status")
		.description("List workspace plans")
		.option("--workspace <slug>", "workspace to list; defaults to the tracked workspace")
		.action(status);

	await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
	if (error instanceof ApiError && typeof error.body === "object") {
		console.error(JSON.stringify(error.body, null, 2));
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
	process.exitCode = 1;
});
