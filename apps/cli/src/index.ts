#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";
import {
	ApiError,
	type DeviceLoginPoll,
	type PlanSummary,
	PlantifilesClient,
	pollDeviceLogin,
	startDeviceLogin,
} from "@plantifiles/api-client";
import { lint } from "@plantifiles/core";
import { CONFIG_PATH, type CliConfig, resolveConnection, saveConfig } from "./config.js";
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

/**
 * OAuth 2.0 device authorization, the flow `gh` and `wrangler` use. The terminal
 * never handles the credential a human can see: it prints a short code, the
 * browser proves who you are, and the token arrives over the polling channel
 * keyed by a device code that was never displayed.
 */
async function login(options: { baseUrl?: string }): Promise<void> {
	const baseUrl = (options.baseUrl ?? process.env.PLANTIFILES_BASE_URL ?? (await askForBaseUrl()))
		.trim()
		.replace(/\/$/, "");
	if (!baseUrl) throw new Error("Plantifiles URL is required.");

	const started = await startDeviceLogin(baseUrl, `${hostname()} (${process.platform})`);
	console.log(`\n  Your code: ${started.userCode}`);
	console.log(`  Approve at: ${started.verificationUri}\n`);
	openUrl(started.verificationUriComplete);
	console.log("Waiting for approval… (Ctrl-C to cancel)");

	const deadline = Date.now() + started.expiresIn * 1000;
	while (Date.now() < deadline) {
		await sleep(started.interval * 1000);
		let result: DeviceLoginPoll;
		try {
			result = await pollDeviceLogin(baseUrl, started.deviceCode);
		} catch (error) {
			// 404 is the server's single answer for expired, denied, and unknown, so
			// it ends the wait rather than looping until the deadline.
			if (error instanceof ApiError && error.status === 404) throw new Error("Login was denied or expired.");
			throw error;
		}
		if (result.status === "pending") continue;

		const config: CliConfig = { token: result.token, baseUrl };
		const workspaces = await new PlantifilesClient(config).listWorkspaces();
		const defaultWorkspace = workspaces.length === 1 ? workspaces[0] : undefined;
		if (defaultWorkspace) config.defaultWorkspace = defaultWorkspace.slug;
		await saveConfig(config);
		console.log(`\nSigned in. Credentials saved to ${CONFIG_PATH} with mode 0600.`);
		if (defaultWorkspace) console.log(`Default workspace: ${defaultWorkspace.slug}`);
		return;
	}
	throw new Error("Login timed out. Run `plantifiles login` again.");
}

async function askForBaseUrl(): Promise<string> {
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return await terminal.question("Plantifiles URL: ");
	} finally {
		terminal.close();
	}
}

async function listWorkspaces(): Promise<void> {
	const connection = await resolveConnection();
	const workspaces = await new PlantifilesClient(connection).listWorkspaces();
	for (const item of workspaces) {
		const tags = item.role;
		const marker = item.slug === connection.defaultWorkspace ? "*" : " ";
		console.log(`${marker} ${item.slug.padEnd(24)} ${item.name} (${tags})`);
	}
}

async function push(file: string, options: PushOptions): Promise<void> {
	const absoluteFile = resolve(file);
	const source = await readFile(absoluteFile, "utf8");
	const root = findRepositoryRoot(process.cwd());
	const state = await loadRepositoryState(root);
	const key = trackedPath(root, absoluteFile);
	const tracked = state[key];
	const connection = await resolveConnection();
	// Explicit flag, then where this file was published before, then the login
	// default when the account had exactly one workspace.
	const workspace = options.workspace ?? tracked?.workspace ?? connection.defaultWorkspace;
	if (!workspace) {
		throw new Error("No workspace to publish to. Pass --workspace <slug>.");
	}

	const client = new PlantifilesClient(connection);
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

function renderStatusTable(plans: PlanSummary[]): string {
	const rows = [
		["TITLE", "STATUS", "VER", "DECISIONS", "APPROVALS", "READ", "AGENT"],
		...plans.map((plan) => [
			plan.title,
			plan.status,
			`v${plan.version}`,
			String(plan.openDecisions),
			String(plan.approvals),
			`${Math.max(1, Math.ceil(plan.readTimeMinutes))}m`,
			plan.agentName ?? "hand edit",
		]),
	];
	const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
	return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")).join("\n");
}

async function status(options: StatusOptions): Promise<void> {
	const connection = await resolveConnection();
	const workspace = options.workspace ?? connection.defaultWorkspace;
	if (!workspace) throw new Error("No workspace to list. Pass --workspace <slug>.");
	const plans = await new PlantifilesClient(connection).listPlans(workspace);
	console.log(plans.length > 0 ? renderStatusTable(plans) : `No plans in ${workspace}.`);
}

async function main(): Promise<void> {
	const program = new Command()
		.name("plantifiles")
		.description("Publish, review, and retrieve Plantifiles plans")
		.showHelpAfterError();
	program.action(() => program.outputHelp());

	program
		.command("login")
		.description("Authorize this machine through the browser")
		.option("--base-url <url>", "Plantifiles service URL")
		.action(login);

	program.command("workspaces").description("List workspaces you belong to").action(listWorkspaces);

	program
		.command("push")
		.description("Publish a plan or create its next version")
		.argument("<file>", "plan file to publish")
		.option("--workspace <slug>", "workspace to publish into")
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
		.option("--workspace <slug>", "workspace to list")
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
