import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb } from "@plantifiles/db";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, type TestContext, vi } from "vitest";
import { createPlan, createPlanVersion } from "./publish-plan.server";
import { advancePlanStatus, approveCurrentVersion, resolveDecision } from "./review.server";

const runtime = vi.hoisted(() => ({
	bindings: null as null | { DB: D1Database },
	failNextBatch: false,
	identity: {
		user: { id: "user-owner", name: "Owner", email: "owner@example.com", image: null },
		method: "bearer" as const,
	},
}));

vi.mock("#/lib/integrations/runtime.server", () => ({
	getBindings: () => {
		if (!runtime.bindings) throw new Error("Test D1 binding is not initialized.");
		const db = runtime.bindings.DB;
		if (!runtime.failNextBatch) return { DB: db, PUBLIC_URL: "https://plans.example" };
		return {
			DB: new Proxy(db, {
				get(target, property) {
					if (property === "batch") {
						return (statements: D1PreparedStatement[]) => {
							runtime.failNextBatch = false;
							return target.batch([
								...statements.slice(0, 2),
								target.prepare("insert into table_that_does_not_exist (id) values ('broken')"),
								...statements.slice(2),
							]);
						};
					}
					const value = Reflect.get(target, property);
					return typeof value === "function" ? value.bind(target) : value;
				},
			}),
			PUBLIC_URL: "https://plans.example",
		};
	},
	getDb: () => {
		if (!runtime.bindings) throw new Error("Test D1 binding is not initialized.");
		return createDb(runtime.bindings.DB);
	},
	getRuntimeConfig: async () => ({
		BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
		GITHUB_CLIENT_ID: undefined,
		GITHUB_CLIENT_SECRET: undefined,
		LOCAL_DEV: "false",
		PUBLIC_URL: "https://plans.example",
	}),
}));

vi.mock("#/lib/integrations/request-auth.server", () => ({
	authenticateRequest: async () => runtime.identity,
	requireIdentity: async () => runtime.identity,
	requireSessionIdentity: async () => ({ ...runtime.identity, method: "session" as const }),
}));

type ContractHarness = {
	db: D1Database;
	request: Request;
	setIdentity(userId: string): void;
	seedUser(userId: string, name?: string): Promise<void>;
	seedMembership(userId: string, role?: "owner" | "member"): Promise<void>;
	all<T>(sql: string, ...values: unknown[]): Promise<T[]>;
	run(sql: string, ...values: unknown[]): Promise<void>;
};

let miniflare: Miniflare | null = null;

async function applyMigrations(db: D1Database): Promise<void> {
	for (const name of [
		"0000_messy_jasper_sitwell.sql",
		"0001_slimy_red_ghost.sql",
		"0002_concerned_runaways.sql",
		"0003_concerned_corsair.sql",
	]) {
		const source = await readFile(resolve(process.cwd(), "../../packages/db/migrations", name), "utf8");
		for (const statement of source
			.split("--> statement-breakpoint")
			.map((part) => part.trim())
			.filter(Boolean)) {
			await db.prepare(statement).run();
		}
	}
}

beforeEach(async (context: TestContext & { harness?: ContractHarness }) => {
	miniflare = new Miniflare(
		convertV4MiniflareOptions({
			script: "export default { fetch() { return new Response('ok') } }",
			modules: true,
			d1Databases: ["DB"],
		}),
	);
	const db = await miniflare.getD1Database("DB");
	await applyMigrations(db);
	runtime.bindings = { DB: db };
	runtime.failNextBatch = false;

	const harness: ContractHarness = {
		db,
		request: new Request("https://plans.example/api"),
		setIdentity(userId) {
			runtime.identity = {
				user: { id: userId, name: userId, email: `${userId}@example.com`, image: null },
				method: "bearer",
			};
		},
		async seedUser(userId, name = userId) {
			await db
				.prepare("insert into user (id, name, email, email_verified) values (?, ?, ?, 1)")
				.bind(userId, name, `${userId}@example.com`)
				.run();
		},
		async seedMembership(userId, role = "member") {
			await db
				.prepare("insert into membership (id, user_id, workspace_id, role) values (?, ?, 'workspace-demo', ?)")
				.bind(`membership-${userId}`, userId, role)
				.run();
		},
		async all<T>(sql: string, ...values: unknown[]) {
			return (
				await db
					.prepare(sql)
					.bind(...values)
					.all<T>()
			).results;
		},
		async run(sql: string, ...values: unknown[]) {
			await db
				.prepare(sql)
				.bind(...values)
				.run();
		},
	};
	await harness.seedUser("user-owner", "Owner");
	await harness.run(
		"insert into workspace (id, slug, name, required_approvals) values ('workspace-demo', 'demo', 'Demo', 1)",
	);
	await harness.seedMembership("user-owner", "owner");
	context.harness = harness;
});

afterEach(async () => {
	runtime.failNextBatch = false;
	runtime.bindings = null;
	await miniflare?.dispose();
	miniflare = null;
});

const VALID_PLAN = `---
title: Contract plan
---
<TLDR>
Keep publication and review state transitions explicit, atomic, and bound to the current immutable plan version.
</TLDR>

## Context

The contract suite exercises persisted behavior through the production module interfaces.

<Decision owner="@owner" id="contract-decision">
Should the publication contract preserve this decision across versions?
</Decision>

<Tradeoff>
<Option name="Preserve" recommended>
The decision remains stable while its source block exists.
</Option>
<Option name="Replace">
Every version starts over, but prior review context is lost.
</Option>
</Tradeoff>

<Rejected what="Unchecked writes">
Partial plan state would make retries unsafe.
</Rejected>

<Diagram lang="mermaid">
\`\`\`mermaid
graph LR
A[Source] --> B[Version]
B --> C[Review]
\`\`\`
</Diagram>

<Phase n="1" title="Publish">
- [ ] Persist the version atomically
</Phase>

<Risk severity="high">
An approval attached to stale source must never approve the current version.
</Risk>
`;

describe("publication and review contracts", () => {
	it("publishes plan, version, blocks, and decisions atomically", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		const result = await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Contract plan",
			source: VALID_PLAN,
			force: true,
		});

		expect(result).toMatchObject({ version: 1, changeSummary: null });
		expect(await harness.all<{ count: number }>("select count(*) as count from plan where id = ?", result.id)).toEqual([
			{ count: 1 },
		]);
		expect(
			await harness.all<{ planCount: number; versionCount: number; blockCount: number; decisionCount: number }>(
				"select (select count(*) from plan) as planCount, (select count(*) from plan_version) as versionCount, (select count(*) from plan_block) as blockCount, (select count(*) from decision) as decisionCount",
			),
		).toEqual([{ planCount: 1, versionCount: 1, blockCount: 9, decisionCount: 1 }]);
	});

	it("leaves no partial rows when a publication batch fails", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		runtime.failNextBatch = true;

		await expect(
			createPlan(harness.request, { workspaceSlug: "demo", title: "Broken batch", source: VALID_PLAN, force: true }),
		).rejects.toThrow();
		expect(await harness.all<{ count: number }>("select count(*) as count from plan")).toEqual([{ count: 0 }]);
		expect(await harness.all<{ count: number }>("select count(*) as count from plan_version")).toEqual([{ count: 0 }]);
	});

	it("blocks approval on open decisions and requires current-version approvals", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		const published = await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Review contract",
			source: VALID_PLAN,
			force: true,
		});
		await advancePlanStatus(harness.request, published.id);

		expect(await approveCurrentVersion(harness.request, published.id)).toMatchObject({
			status: "in_review",
			reason: expect.stringContaining("open decision"),
		});
		expect(await resolveDecision(harness.request, published.id, "contract-decision", "Preserve it.")).toMatchObject({
			status: "approved",
		});

		await createPlanVersion(harness.request, published.id, {
			source: VALID_PLAN.replace("Contract plan", "Contract plan revised"),
			force: true,
		});
		expect(await harness.all<{ status: string }>("select status from plan where id = ?", published.id)).toEqual([
			{ status: "in_review" },
		]);
		expect(await advancePlanStatus(harness.request, published.id)).toMatchObject({
			status: "in_review",
			reason: expect.stringContaining("approval"),
		});
	});

	it("enforces multiple approvals, owner transitions, and archived finality", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.run("update workspace set required_approvals = 2 where id = 'workspace-demo'");
		await harness.seedUser("user-member", "Member");
		await harness.seedMembership("user-member", "member");
		const published = await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Threshold contract",
			source: VALID_PLAN,
			force: true,
		});
		await resolveDecision(harness.request, published.id, "contract-decision", "Resolved.");
		await advancePlanStatus(harness.request, published.id);
		expect(await approveCurrentVersion(harness.request, published.id)).toMatchObject({
			status: "in_review",
			reason: expect.stringContaining("1 more approval"),
		});

		harness.setIdentity("user-member");
		await expect(advancePlanStatus(harness.request, published.id)).rejects.toMatchObject({ status: 403 });
		expect(await approveCurrentVersion(harness.request, published.id)).toMatchObject({ status: "approved" });

		harness.setIdentity("user-owner");
		expect(await advancePlanStatus(harness.request, published.id)).toMatchObject({ status: "archived" });
		expect(await advancePlanStatus(harness.request, published.id)).toMatchObject({
			status: "archived",
			reason: "Archived is the final lifecycle state.",
		});
	});
});
