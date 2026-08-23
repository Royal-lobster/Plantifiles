#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { CONFIG_PATH, createAuth, loadConfig, resolveConnection, saveConfig } from "@plantifiles/auth";
import { ApiError, type MovedPlan, type PlanSummary, PlantifilesClient } from "@plantifiles/api-client";
import { lint } from "@plantifiles/core";
import { Command } from "commander";
import { findRepositoryRoot, loadRepositoryState, saveRepositoryState, trackedPath } from "./repository-state.js";

/** The hosted service, so `plantifiles login` needs no argument for the common case. */
const DEFAULT_BASE_URL = "https://plantifiles.com";

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

type MoveOptions = {
	to: string;
	slug?: string;
};

function titleFromSource(source: string, file: string): string {
	const frontmatterTitle = source.match(/^---\r?\n[\s\S]*?^title:\s*(.+?)\s*$[\s\S]*?^---$/m)?.[1];
	if (frontmatterTitle) return frontmatterTitle.replace(/^['"]|['"]$/g, "");
	const extension = extname(file);
	return basename(file, extension)
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function login(options: { baseUrl?: string }): Promise<void> {
	const baseUrl = (options.baseUrl ?? process.env.PLANTIFILES_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/$/, "");
	if (!baseUrl) throw new Error("Plantifiles URL is required.");
	console.log(`Signing in to ${baseUrl}`);

	/* Storage degrades to a file mid-login. Collecting the notice and printing it
	   after the result keeps a working sign-in from reading as a failure. */
	const notices = new Set<string>();
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	const auth = createAuth(baseUrl, { warn: (message) => notices.add(message) });
	try {
		const user = await auth.login({
			async openBrowser(url) {
				console.log(`\nOpen this URL to sign in:\n${url}\n`);
				await openUrl(url);
			},
			readAuthorizationResponse: () => terminal.question("Paste the authorization code shown by Plantifiles:\n> "),
		});
		const connection = {
			baseUrl,
			async getAccessToken() {
				const token = await auth.getAccessToken();
				if (!token) throw new Error("Clerk did not retain the new login.");
				return token;
			},
		};
		const workspaces = await new PlantifilesClient(connection).listWorkspaces();
		const defaultWorkspace = workspaces.length === 1 ? workspaces[0] : undefined;
		await saveConfig({
			baseUrl,
			...(defaultWorkspace ? { defaultWorkspace: defaultWorkspace.slug } : {}),
		});
		console.log(`\nSigned in${user.email ? ` as ${user.email}` : ""}.`);
		if (defaultWorkspace) console.log(`Default workspace: ${defaultWorkspace.slug}`);
		console.log(`Configuration: ${CONFIG_PATH}`);
		console.log(`Credentials:   ${auth.credentialLocation()}`);
		for (const notice of notices) console.log(`\nNote: ${notice}`);
	} finally {
		terminal.close();
	}
}

async function logout(): Promise<void> {
	const saved = await loadConfig();
	const baseUrl = process.env.PLANTIFILES_BASE_URL?.trim() || saved?.baseUrl;
	if (!baseUrl) throw new Error("No Plantifiles login is configured.");
	await createAuth(baseUrl).logout();
	console.log("Signed out of Plantifiles on this machine.");
	if (process.env.PLANTIFILES_TOKEN) {
		console.log("PLANTIFILES_TOKEN remains active because environment credentials are not managed by the CLI.");
	}
}

async function whoami(): Promise<void> {
	const saved = await loadConfig();
	const baseUrl = process.env.PLANTIFILES_BASE_URL?.trim() || saved?.baseUrl;
	if (!baseUrl) {
		console.log("Not signed in. Run `plantifiles login`.");
		return;
	}

	const apiKey = process.env.PLANTIFILES_TOKEN?.trim();
	const notices = new Set<string>();
	const auth = createAuth(baseUrl, {
		...(apiKey ? { apiKey } : {}),
		warn: (message) => notices.add(message),
	});
	const user = apiKey ? null : await auth.whoami();
	if (!apiKey && !user) {
		console.log(`Not signed in to ${baseUrl}. Run \`plantifiles login\`.`);
		return;
	}

	console.log(`Service:    ${baseUrl}`);
	if (apiKey) {
		console.log("Credential: Clerk API key from PLANTIFILES_TOKEN");
		console.log("Account:    not stored locally; an API key carries no local identity");
	} else if (user) {
		console.log(`Account:    ${user.email ?? user.sub}`);
		console.log(`Credential: OAuth session in ${auth.credentialLocation()}`);
	}
	if (saved?.defaultWorkspace) console.log(`Workspace:  ${saved.defaultWorkspace} (default)`);

	/* Local state says who you were; only a request says whether you still are.
	   A revoked key or a dead refresh token looks identical on disk. */
	try {
		const token = await auth.getAccessToken();
		if (!token) throw new Error("no usable credential");
		const workspaces = await new PlantifilesClient({ baseUrl, getAccessToken: async () => token }).listWorkspaces();
		console.log(`Verified:   works, ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"} reachable`);
	} catch (error) {
		console.log(`Verified:   FAILED, ${error instanceof Error ? error.message : String(error)}`);
	}
	for (const notice of notices) console.log(`\nNote: ${notice}`);
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

/**
 * Recovery path for the easiest mistake to make with `push`: the plan landed in
 * the wrong organization. Accepts the same file argument as `push` when the plan
 * is tracked in this repository, so the fix reads like the mistake.
 */
async function move(target: string, options: MoveOptions): Promise<void> {
	const connection = await resolveConnection();
	const client = new PlantifilesClient(connection);
	const root = findRepositoryRoot(process.cwd());
	const state = await loadRepositoryState(root);
	const tracked = state[trackedPath(root, resolve(target))];
	if (!tracked && existsSync(resolve(target))) {
		throw new Error(`${target} has not been pushed from this repository. Pass the plan ID or URL instead.`);
	}
	const planId = tracked?.planId ?? (await client.resolvePlan(target)).plan.id;
	const result = await movePlanOrExplainCollision(client, planId, options);

	// Repoint tracked state so the next `push` follows the plan instead of
	// republishing it into the organization it was just moved out of.
	for (const [path, entry] of Object.entries(state)) {
		if (entry.planId !== planId) continue;
		state[path] = { planId, url: result.url, workspace: result.workspaceSlug };
	}
	await saveRepositoryState(root, state);

	console.log(result.url);
	console.log(
		result.movedFrom
			? `Moved from ${result.movedFrom} to ${result.workspaceSlug}.`
			: `Already in ${result.workspaceSlug}.`,
	);
	if (result.clearedApprovals > 0) {
		const plural = result.clearedApprovals === 1 ? "approval" : "approvals";
		console.log(`Cleared ${result.clearedApprovals} ${plural}; ${result.workspaceSlug} must approve v-current again.`);
	}
}

/**
 * A collision is the one move failure the caller can fix from here, so it gets a
 * sentence naming the flag instead of the raw 409 body every other error prints.
 */
async function movePlanOrExplainCollision(
	client: PlantifilesClient,
	planId: string,
	options: MoveOptions,
): Promise<MovedPlan> {
	try {
		return await client.movePlan(planId, { workspaceSlug: options.to, slug: options.slug });
	} catch (error) {
		const body = error instanceof ApiError ? error.body : null;
		if (body && typeof body === "object" && "error" in body && body.error === "slug_conflict") {
			throw new Error(
				`${"message" in body ? String(body.message) : "The destination slug is taken."} Retry with --slug <slug>.`,
			);
		}
		throw error;
	}
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

async function openUrl(url: string): Promise<void> {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	await new Promise<void>((resolveOpen) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.once("error", resolveOpen);
		child.once("spawn", () => {
			child.unref();
			resolveOpen();
		});
	});
}

async function openPlan(id: string): Promise<void> {
	const config = await resolveConnection();
	const detail = await new PlantifilesClient(config).getPlan(id);
	await openUrl(
		`${config.baseUrl}/p/${encodeURIComponent(detail.workspace.slug)}/${encodeURIComponent(detail.plan.slug)}`,
	);
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

	program.command("logout").description("Revoke this machine's browser login").action(logout);

	program.command("whoami").description("Show the signed-in account and verify the credential").action(whoami);

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
		.command("move")
		.description("Move a plan to a different organization")
		.argument("<file-or-id-or-url>", "tracked plan file, plan ID, or plan URL")
		.requiredOption("--to <slug>", "organization the plan should end up in")
		.option("--slug <slug>", "new plan slug; only needed when the destination already has that slug")
		.addHelpText(
			"after",
			"\nApprovals on the current version are cleared, because they were granted by the previous organization.\nA tracked file's next push follows the plan to its new organization.",
		)
		.action(move);

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
