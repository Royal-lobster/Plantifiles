import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb } from "@plantifiles/db";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, type TestContext, vi } from "vitest";
import { listMoveTargets, movePlan } from "./move-plan.server";
import { listPlans, loadPlanDocument, loadPlanReaderData, renderPlanMarkdown } from "./plan-reader.server";
import { createPlan, createPlanVersion } from "./publish-plan.server";
import { advancePlanStatus, approveCurrentVersion, resolveDecision } from "./review.server";

const runtime = vi.hoisted(() => ({
	bindings: null as null | { DB: D1Database },
	failNextBatch: false,
	identity: {
		user: { id: "user-owner", name: "Owner", email: "owner@example.com", image: null },
		method: "oauth" as const,
		scopes: ["plantifiles:read", "plantifiles:write"],
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
		CLERK_PUBLISHABLE_KEY: "pk_test_contract",
		CLERK_SECRET_KEY: "sk_test_contract",
		CLERK_OAUTH_CLIENT_ID: "client_contract",
		CLERK_OAUTH_ISSUER: "https://clerk.example",
		CLERK_WEBHOOK_SIGNING_SECRET: "whsec_contract",
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
	seedWorkspace(workspaceId: string, slug: string, name: string): Promise<void>;
	seedMembership(userId: string, role?: "owner" | "member", workspaceId?: string): Promise<void>;
	all<T>(sql: string, ...values: unknown[]): Promise<T[]>;
	run(sql: string, ...values: unknown[]): Promise<void>;
};

let miniflare: Miniflare | null = null;

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), "../../packages/db/migrations");

async function applyMigrations(db: D1Database): Promise<void> {
	// Read the directory rather than a hardcoded list: a migration added without
	// touching this file used to leave the harness on an older schema, and the
	// failure surfaced as an unrelated "no such column" deep inside a query.
	const names = (await readdir(MIGRATIONS_DIRECTORY)).filter((name) => name.endsWith(".sql")).sort();
	for (const name of names) {
		const source = await readFile(resolve(MIGRATIONS_DIRECTORY, name), "utf8");
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
	// Identity is module state in the mocked auth module, so a test that ends as
	// somebody else must not decide who the next test runs as.
	runtime.identity = {
		user: { id: "user-owner", name: "Owner", email: "owner@example.com", image: null },
		method: "oauth",
		scopes: ["plantifiles:read", "plantifiles:write"],
	};

	const harness: ContractHarness = {
		db,
		request: new Request("https://plans.example/api"),
		setIdentity(userId) {
			runtime.identity = {
				user: { id: userId, name: userId, email: `${userId}@example.com`, image: null },
				method: "oauth",
				scopes: ["plantifiles:read", "plantifiles:write"],
			};
		},
		async seedUser(userId, name = userId) {
			await db
				.prepare("insert into user (id, name, email, email_verified) values (?, ?, ?, 1)")
				.bind(userId, name, `${userId}@example.com`)
				.run();
		},
		async seedWorkspace(workspaceId, slug, name) {
			await db
				.prepare("insert into workspace (id, clerk_organization_id, slug, name) values (?, ?, ?, ?)")
				.bind(workspaceId, `org_local_${slug}`, slug, name)
				.run();
		},
		async seedMembership(userId, role = "member", workspaceId = "workspace-demo") {
			await db
				.prepare("insert into membership (id, user_id, workspace_id, role) values (?, ?, ?, ?)")
				.bind(`membership-${userId}-${workspaceId}`, userId, workspaceId, role)
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
		"insert into workspace (id, clerk_organization_id, slug, name) values ('workspace-demo', 'org_local_demo', 'demo', 'Demo')",
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
kind: plan
emoji: 🧪
---
<TLDR id="summary">
Keep publication and review state transitions explicit, atomic, and bound to the current immutable plan version.
</TLDR>

## Context

The contract suite exercises persisted behavior through the production module interfaces.

<Decision owner="@owner" id="contract-decision">
Should the publication contract preserve this decision across versions?
</Decision>

<Tradeoff id="review-options">
<Option name="Preserve" recommended>
The decision remains stable while its source block exists.
</Option>
<Option name="Replace">
Every version starts over, but prior review context is lost.
</Option>
</Tradeoff>

<Rejected id="rejected-unchecked-writes" what="Unchecked writes">
Partial plan state would make retries unsafe.
</Rejected>

<Diagram id="review-flow" lang="mermaid">
\`\`\`mermaid
graph LR
A[Source] --> B[Version]
B --> C[Review]
\`\`\`
</Diagram>

<Phase id="phase-publish" n="1" title="Publish">
- [ ] Persist the version atomically

**Gate:** The publication batch stores the plan, version, blocks, and decisions together.

**Rollback:** Revert the internal write path before accepting another publication.
</Phase>

<Diagram id="review-lifecycle" lang="mermaid">
\`\`\`mermaid
stateDiagram-v2
[*] --> Draft
Draft --> Approved: decision resolved and current version approved
\`\`\`
</Diagram>

<Risk id="risk-stale-approval" severity="high">
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
		).toEqual([{ planCount: 1, versionCount: 1, blockCount: 10, decisionCount: 1 }]);
	});

	it("keeps profile metadata in canonical Markdown pull-back", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Contract plan",
			source: VALID_PLAN,
		});
		const document = await loadPlanDocument(harness.request, "demo", "contract-plan");
		const markdown = await renderPlanMarkdown(document);
		expect(markdown).toContain('title: "Contract plan"');
		expect(markdown).toContain("kind: plan");
		expect(markdown.match(/^kind: plan$/gm)).toHaveLength(1);
		expect(markdown).toContain('<TLDR id="summary">');
	});

	it("rejects unsafe grammar even when force is true", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		const unsafeSource = VALID_PLAN.replace('<TLDR id="summary">', '<TLDR id="summary" tone="unsafe">');
		await expect(
			createPlan(harness.request, {
				workspaceSlug: "demo",
				title: "Unsafe plan",
				source: unsafeSource,
				force: true,
			}),
		).rejects.toMatchObject({ status: 422 });
		expect(await harness.all<{ count: number }>("select count(*) as count from plan")).toEqual([{ count: 0 }]);
		expect(await harness.all<{ count: number }>("select count(*) as count from plan_version")).toEqual([{ count: 0 }]);
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

	it("blocks approval on open decisions and requires one current-version approval", async (context) => {
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

	it("enforces owner transitions and archived finality", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedUser("user-member", "Member");
		await harness.seedMembership("user-member", "member");
		const published = await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Role contract",
			source: VALID_PLAN,
			force: true,
		});
		await resolveDecision(harness.request, published.id, "contract-decision", "Resolved.");
		await advancePlanStatus(harness.request, published.id);

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

	it("derives viewer-relative mine and needsMyReview on the plan list", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedUser("user-member", "Member");
		await harness.seedMembership("user-member", "member");
		await harness.run("update user set image = ? where id = 'user-owner'", "https://images.example/owner.png");
		const published = await createPlan(harness.request, {
			workspaceSlug: "demo",
			title: "Viewer contract",
			source: VALID_PLAN,
			force: true,
		});
		await advancePlanStatus(harness.request, published.id);

		const {
			items: [asCreator],
		} = await listPlans(harness.request, "demo");
		expect(asCreator).toMatchObject({
			status: "in_review",
			creatorName: "Owner",
			creatorImage: "https://images.example/owner.png",
			mine: true,
			needsMyReview: false,
		});

		harness.setIdentity("user-member");
		const {
			items: [asReviewer],
		} = await listPlans(harness.request, "demo");
		expect(asReviewer).toMatchObject({
			creatorName: "Owner",
			creatorImage: "https://images.example/owner.png",
			mine: false,
			needsMyReview: true,
		});
		const versionRows = await harness.all<{ versionId: string }>(
			"select current_version_id as versionId from plan where id = ?",
			published.id,
		);
		const versionId = versionRows[0]?.versionId;
		if (!versionId) throw new Error("plan has no current version");
		await harness.run(
			"insert into approval (id, plan_id, version_id, user_id) values ('approval-member', ?, ?, 'user-member')",
			published.id,
			versionId,
		);
		const {
			items: [afterApproval],
		} = await listPlans(harness.request, "demo");
		expect(afterApproval).toMatchObject({ mine: false, needsMyReview: false });
	});

	it("paginates plans without duplicates across equal timestamps", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		for (const title of ["Alpha plan", "Beta plan", "Gamma plan"]) {
			await createPlan(harness.request, {
				workspaceSlug: "demo",
				title,
				source: VALID_PLAN.replace("Contract plan", title),
				force: true,
			});
		}

		const first = await listPlans(harness.request, "demo", { limit: 2 });
		expect(first.items).toHaveLength(2);
		if (!first.nextCursor) throw new Error("first page did not return a cursor");
		const second = await listPlans(harness.request, "demo", { limit: 2, cursor: first.nextCursor });
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
		expect(new Set([...first.items, ...second.items].map((item) => item.id))).toHaveProperty("size", 3);
	});

	it("rejects malformed plan cursors", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await expect(listPlans(harness.request, "demo", { cursor: "not-a-cursor" })).rejects.toMatchObject({
			status: 400,
		});
	});
});

describe("organization move contracts", () => {
	async function publishInDemo(harness: ContractHarness, title = "Movable plan") {
		return createPlan(harness.request, { workspaceSlug: "demo", title, source: VALID_PLAN, force: true });
	}

	it("moves the plan, rewrites its URL, and drops approvals granted by the old organization", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedWorkspace("workspace-other", "other", "Other");
		await harness.seedMembership("user-owner", "member", "workspace-other");
		const published = await publishInDemo(harness);
		await resolveDecision(harness.request, published.id, "contract-decision", "Resolved.");
		await advancePlanStatus(harness.request, published.id);
		expect(await approveCurrentVersion(harness.request, published.id)).toMatchObject({ status: "approved" });

		const moved = await movePlan(harness.request, published.id, { workspaceSlug: "other" });

		expect(moved).toMatchObject({
			workspaceSlug: "other",
			slug: "movable-plan",
			url: "https://plans.example/p/other/movable-plan",
			status: "in_review",
			movedFrom: "demo",
			clearedApprovals: 1,
		});
		expect(
			await harness.all<{ workspaceId: string; status: string; approvals: number }>(
				"select workspace_id as workspaceId, status, (select count(*) from approval where plan_id = plan.id) as approvals from plan where id = ?",
				published.id,
			),
		).toEqual([{ workspaceId: "workspace-other", status: "in_review", approvals: 0 }]);
		// Version history, comments, and decisions follow the plan rather than the
		// organization, so the moved plan still reads as one artifact.
		const document = await loadPlanDocument(harness.request, "other", "movable-plan");
		expect(document.version.number).toBe(1);
		expect(document.decisions).toHaveLength(1);
		await expect(loadPlanDocument(harness.request, "demo", "movable-plan")).rejects.toMatchObject({ status: 404 });
	});

	it("refuses a destination the mover does not belong to", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedWorkspace("workspace-other", "other", "Other");
		const published = await publishInDemo(harness);

		await expect(movePlan(harness.request, published.id, { workspaceSlug: "other" })).rejects.toMatchObject({
			status: 403,
		});
		expect(
			await harness.all<{ workspaceId: string }>(
				"select workspace_id as workspaceId from plan where id = ?",
				published.id,
			),
		).toEqual([{ workspaceId: "workspace-demo" }]);
	});

	it("reports slug collisions before the move and accepts a slug that resolves them", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedWorkspace("workspace-other", "other", "Other");
		await harness.seedMembership("user-owner", "member", "workspace-other");
		const published = await publishInDemo(harness);
		await createPlan(harness.request, {
			workspaceSlug: "other",
			title: "Movable plan",
			source: VALID_PLAN,
			force: true,
		});

		expect(await listMoveTargets(harness.request, published.id)).toEqual([
			{ id: "workspace-other", slug: "other", name: "Other", role: "member", slugTaken: true },
		]);
		await expect(movePlan(harness.request, published.id, { workspaceSlug: "other" })).rejects.toMatchObject({
			name: "PlanSlugConflictError",
			workspaceSlug: "other",
			slug: "movable-plan",
		});

		const moved = await movePlan(harness.request, published.id, { workspaceSlug: "other", slug: "Movable Plan v2" });
		expect(moved).toMatchObject({ workspaceSlug: "other", slug: "movable-plan-v2" });
	});

	it("treats a move into the current organization as a no-op instead of a conflict", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		const published = await publishInDemo(harness);

		expect(await movePlan(harness.request, published.id, { workspaceSlug: "demo" })).toMatchObject({
			workspaceSlug: "demo",
			movedFrom: null,
			clearedApprovals: 0,
		});
	});

	it("limits moving to the plan's author, against organization owners included", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedWorkspace("workspace-other", "other", "Other");
		await harness.seedUser("user-member", "Member");
		await harness.seedMembership("user-member", "member");
		await harness.seedMembership("user-member", "member", "workspace-other");
		await harness.seedMembership("user-owner", "owner", "workspace-other");

		harness.setIdentity("user-member");
		const published = await publishInDemo(harness);

		// Owner of both organizations, author of neither plan: review authority
		// over a plan is not the right to relocate it.
		harness.setIdentity("user-owner");
		await expect(movePlan(harness.request, published.id, { workspaceSlug: "other" })).rejects.toMatchObject({
			status: 403,
		});
		await expect(listMoveTargets(harness.request, published.id)).rejects.toMatchObject({ status: 403 });

		harness.setIdentity("user-member");
		expect(await movePlan(harness.request, published.id, { workspaceSlug: "other" })).toMatchObject({
			movedFrom: "demo",
		});
	});

	it("tells the plan page which viewers may move it", async (context) => {
		const harness = (context as TestContext & { harness: ContractHarness }).harness;
		await harness.seedUser("user-member", "Member");
		await harness.seedMembership("user-member", "member");
		await harness.seedUser("user-second-owner", "Second owner");
		await harness.seedMembership("user-second-owner", "owner");
		await publishInDemo(harness);

		const asAuthor = await loadPlanReaderData(harness.request, "demo", "movable-plan");
		expect(asAuthor.viewer).toEqual({ id: "user-owner", name: "Owner", image: null, canMovePlan: true });

		harness.setIdentity("user-member");
		const asMember = await loadPlanReaderData(harness.request, "demo", "movable-plan");
		expect(asMember.viewer).toEqual({ id: "user-member", name: "user-member", image: null, canMovePlan: false });

		harness.setIdentity("user-second-owner");
		const asOtherOwner = await loadPlanReaderData(harness.request, "demo", "movable-plan");
		expect(asOtherOwner.viewer).toEqual({
			id: "user-second-owner",
			name: "user-second-owner",
			image: null,
			canMovePlan: false,
		});
	});
});
