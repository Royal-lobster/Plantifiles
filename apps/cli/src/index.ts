#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { lint } from "@plantifiles/core";
import { ApiError, type PlanStatus, PlantifilesClient } from "./api.js";
import { CONFIG_PATH, resolveConnection, saveConfig } from "./config.js";
import { findRepositoryRoot, loadRepositoryState, saveRepositoryState, trackedPath } from "./repository-state.js";

const HELP = `plantifiles <command>

Commands:
  login                         Save an API token
  push <file> [--emoji <char>] Publish a plan or create its next version
  pull <id|url> [-o file]       Fetch byte-identical plan source
  lint <file>                   Lint a plan locally
  open <id>                     Open a plan in the browser
  status [--workspace slug]     List workspace plans

Push options:
  --emoji <char>               One representative emoji for the plan
`;

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

async function push(args: string[]): Promise<void> {
	const parsed = parseArgs({
		args,
		allowPositionals: true,
		options: {
			workspace: { type: "string" },
			title: { type: "string" },
			agent: { type: "string" },
			prompt: { type: "string" },
			emoji: { type: "string" },
			force: { type: "boolean", default: false },
		},
	});
	const file = parsed.positionals[0];
	if (!file) throw new Error("Usage: plantifiles push <file> [--workspace slug]");
	const absoluteFile = resolve(file);
	const source = await readFile(absoluteFile, "utf8");
	const root = findRepositoryRoot(process.cwd());
	const state = await loadRepositoryState(root);
	const key = trackedPath(root, absoluteFile);
	const tracked = state[key];
	const workspace = parsed.values.workspace ?? tracked?.workspace;
	if (!workspace) throw new Error("A first push requires --workspace <slug>.");

	const client = new PlantifilesClient(await resolveConnection());
	const result = tracked
		? await client.createVersion(tracked.planId, {
				source,
				emoji: parsed.values.emoji,
				agentName: parsed.values.agent,
				agentPrompt: parsed.values.prompt,
				force: parsed.values.force,
			})
		: await client.createPlan({
				workspaceSlug: workspace,
				title: parsed.values.title ?? titleFromSource(source, file),
				emoji: parsed.values.emoji,
				source,
				agentName: parsed.values.agent,
				agentPrompt: parsed.values.prompt,
				force: parsed.values.force,
			});
	state[key] = { planId: result.id, url: result.url, workspace };
	await saveRepositoryState(root, state);
	console.log(result.url);
	if (result.changeSummary) console.log(result.changeSummary);
}

async function pull(args: string[]): Promise<void> {
	const parsed = parseArgs({
		args,
		allowPositionals: true,
		options: { output: { type: "string", short: "o" } },
	});
	const idOrUrl = parsed.positionals[0];
	if (!idOrUrl) throw new Error("Usage: plantifiles pull <id|url> [-o file]");
	const detail = await new PlantifilesClient(await resolveConnection()).resolvePlan(idOrUrl);
	if (parsed.values.output) {
		await writeFile(resolve(parsed.values.output), detail.version.source, "utf8");
		console.log(`Wrote ${parsed.values.output}`);
		return;
	}
	process.stdout.write(detail.version.source);
}

async function lintFile(args: string[]): Promise<void> {
	const file = args[0];
	if (!file) throw new Error("Usage: plantifiles lint <file>");
	const report = lint(await readFile(resolve(file), "utf8"));
	for (const finding of report.findings) {
		console.log(`${file}:${finding.line} ${finding.rule} ${finding.message}`);
	}
	console.log(`score ${report.score}`);
	if (report.errors > 0) process.exitCode = 1;
}

function openUrl(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.unref();
}

async function openPlan(args: string[]): Promise<void> {
	const id = args[0];
	if (!id) throw new Error("Usage: plantifiles open <id>");
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

async function status(args: string[]): Promise<void> {
	const parsed = parseArgs({ args, options: { workspace: { type: "string" } } });
	let workspace = parsed.values.workspace;
	if (!workspace) {
		const root = findRepositoryRoot(process.cwd());
		workspace = Object.values(await loadRepositoryState(root))[0]?.workspace;
	}
	if (!workspace) throw new Error("Use --workspace <slug> before a plan has been tracked in this repository.");
	const plans = await new PlantifilesClient(await resolveConnection()).listPlans(workspace);
	console.log(plans.length > 0 ? renderStatusTable(plans) : `No plans in ${workspace}.`);
}

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	switch (command) {
		case "login":
			await login();
			break;
		case "push":
			await push(args);
			break;
		case "pull":
			await pull(args);
			break;
		case "lint":
			await lintFile(args);
			break;
		case "open":
			await openPlan(args);
			break;
		case "status":
			await status(args);
			break;
		case "help":
		case "--help":
		case "-h":
		case undefined:
			console.log(HELP);
			break;
		default:
			throw new Error(`Unknown command: ${command}\n\n${HELP}`);
	}
}

main().catch((error: unknown) => {
	if (error instanceof ApiError && typeof error.body === "object") {
		console.error(JSON.stringify(error.body, null, 2));
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
	process.exitCode = 1;
});
