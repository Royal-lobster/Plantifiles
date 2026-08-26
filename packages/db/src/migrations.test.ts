import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyD1Database } from "drizzle-orm/d1";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

let miniflare: Miniflare | undefined;
let db: AnyD1Database;

async function applyMigrations(database: AnyD1Database): Promise<void> {
	const migrationNames = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
	for (const name of migrationNames) {
		const source = await readFile(resolve(migrationsDirectory, name), "utf8");
		const statements = source
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);
		for (const statement of statements) await database.prepare(statement).run();
	}
}

async function seedOwner(database: AnyD1Database): Promise<void> {
	await database
		.prepare("insert into user (id, name, email) values (?, ?, ?)")
		.bind("user-owner", "Owner", "owner@example.com")
		.run();
	await database
		.prepare("insert into workspace (id, slug, name) values (?, ?, ?)")
		.bind("workspace-main", "main", "main workspace")
		.run();
}

async function insertPlan(database: AnyD1Database, id: string, workspaceId: string, slug: string): Promise<void> {
	await database
		.prepare("insert into plan (id, workspace_id, slug, title, created_by_id) values (?, ?, ?, ?, ?)")
		.bind(id, workspaceId, slug, `${slug} plan`, "user-owner")
		.run();
}

beforeEach(async () => {
	miniflare = new Miniflare(
		convertV4MiniflareOptions({
			script: "export default { fetch() { return new Response('ok') } }",
			modules: true,
			d1Databases: ["DB"],
		}),
	);
	db = await miniflare.getD1Database("DB");
	await applyMigrations(db);
});

afterEach(async () => {
	await miniflare?.dispose();
	miniflare = undefined;
});

describe("database migrations", () => {
	it("apply to an empty D1 database and support a complete plan graph", async () => {
		await seedOwner(db);
		await insertPlan(db, "plan-launch", "workspace-main", "launch");
		await db
			.prepare(
				"insert into plan_version (id, plan_id, number, source, lint_score, lint_report, author_id) values (?, ?, ?, ?, ?, ?, ?)",
			)
			.bind("version-1", "plan-launch", 1, "# Launch", 100, "{}", "user-owner")
			.run();
		await db
			.prepare("insert into plan_block (id, version_id, key, kind, ordinal, content_hash) values (?, ?, ?, ?, ?, ?)")
			.bind("block-1", "version-1", "overview", "section", 0, "hash-1")
			.run();
		await db
			.prepare("insert into comment (id, plan_id, version_id, body, author_id) values (?, ?, ?, ?, ?)")
			.bind("comment-1", "plan-launch", "version-1", "Looks good", "user-owner")
			.run();
		await db
			.prepare("insert into decision (id, plan_id, key) values (?, ?, ?)")
			.bind("decision-1", "plan-launch", "ship-date")
			.run();
		await db
			.prepare("insert into approval (id, plan_id, version_id, user_id) values (?, ?, ?, ?)")
			.bind("approval-1", "plan-launch", "version-1", "user-owner")
			.run();
		await db
			.prepare("insert into membership (id, user_id, workspace_id, role) values (?, ?, ?, ?)")
			.bind("membership-1", "user-owner", "workspace-main", "owner")
			.run();

		const plan = await db
			.prepare("select status, visibility from plan where id = ?")
			.bind("plan-launch")
			.first<{ status: string; visibility: string }>();
		const approval = await db
			.prepare("select id from approval where version_id = ? and user_id = ?")
			.bind("version-1", "user-owner")
			.first<{ id: string }>();

		expect(plan).toEqual({ status: "draft", visibility: "workspace" });
		expect(approval).toEqual({ id: "approval-1" });
	});

	it("enforces plan slugs as unique within a workspace", async () => {
		await seedOwner(db);
		await insertPlan(db, "plan-main", "workspace-main", "roadmap");

		await expect(insertPlan(db, "plan-duplicate", "workspace-main", "roadmap")).rejects.toThrow();

		await db
			.prepare("insert into workspace (id, slug, name) values (?, ?, ?)")
			.bind("workspace-other", "other", "other workspace")
			.run();
		await insertPlan(db, "plan-other", "workspace-other", "roadmap");
		const result = await db
			.prepare("select count(*) as count from plan where slug = ?")
			.bind("roadmap")
			.first<{ count: number }>();
		expect(result?.count).toBe(2);
	});

	it("rejects plan states outside the allowed lifecycle", async () => {
		await seedOwner(db);

		await expect(
			db
				.prepare("insert into plan (id, workspace_id, slug, title, status, created_by_id) values (?, ?, ?, ?, ?, ?)")
				.bind("plan-invalid", "workspace-main", "invalid", "Invalid", "publishing", "user-owner")
				.run(),
		).rejects.toThrow();
	});

	it("enforces foreign keys and cascades owned plan records", async () => {
		await seedOwner(db);
		await expect(insertPlan(db, "plan-orphan", "workspace-missing", "orphan")).rejects.toThrow();

		await insertPlan(db, "plan-owned", "workspace-main", "owned");
		await db
			.prepare(
				"insert into plan_version (id, plan_id, number, source, lint_score, lint_report, author_id) values (?, ?, ?, ?, ?, ?, ?)",
			)
			.bind("version-owned", "plan-owned", 1, "# Owned", 100, "{}", "user-owner")
			.run();
		await db.prepare("delete from plan where id = ?").bind("plan-owned").run();

		const version = await db
			.prepare("select id from plan_version where id = ?")
			.bind("version-owned")
			.first<{ id: string }>();
		expect(version).toBeNull();
	});
});
