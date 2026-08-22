import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp" });
const createdAt = () => timestamp("created_at").notNull().default(sql`(unixepoch())`);
const updatedAt = () => timestamp("updated_at").notNull().default(sql`(unixepoch())`);

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	clerkUserId: text("clerk_user_id").unique(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
	image: text("image"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const workspace = sqliteTable("workspace", {
	id: text("id").primaryKey(),
	clerkOrganizationId: text("clerk_organization_id").unique(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
});

export const plan = sqliteTable(
	"plan",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		emoji: text("emoji"),
		status: text("status", {
			enum: ["draft", "in_review", "approved", "archived"],
		})
			.notNull()
			.default("draft"),
		visibility: text("visibility", { enum: ["private", "workspace", "public"] })
			.notNull()
			.default("workspace"),
		publicSlug: text("public_slug").unique(),
		createdById: text("created_by_id")
			.notNull()
			.references(() => user.id),
		currentVersionId: text("current_version_id"),
		updatedAt: updatedAt(),
	},
	(table) => [
		unique("plan_workspace_slug").on(table.workspaceId, table.slug),
		index("plan_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
		check("plan_status_ck", sql`${table.status} in ('draft','in_review','approved','archived')`),
		check("plan_visibility_ck", sql`${table.visibility} in ('private','workspace','public')`),
	],
);

export const planVersion = sqliteTable(
	"plan_version",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plan.id, { onDelete: "cascade" }),
		number: integer("number").notNull(),
		source: text("source").notNull(),
		changeSummary: text("change_summary"),
		lintScore: integer("lint_score").notNull(),
		lintReport: text("lint_report", { mode: "json" }).$type<unknown>().notNull(),
		lintOverridden: integer("lint_overridden", { mode: "boolean" }).notNull().default(false),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id),
		agentName: text("agent_name"),
		agentPrompt: text("agent_prompt"),
		createdAt: createdAt(),
	},
	(table) => [
		unique("plan_version_number").on(table.planId, table.number),
		index("plan_version_plan_idx").on(table.planId),
	],
);

export const planBlock = sqliteTable(
	"plan_block",
	{
		id: text("id").primaryKey(),
		versionId: text("version_id")
			.notNull()
			.references(() => planVersion.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		kind: text("kind").notNull(),
		ordinal: integer("ordinal").notNull(),
		contentHash: text("content_hash").notNull(),
	},
	(table) => [
		unique("plan_block_version_key").on(table.versionId, table.key),
		index("plan_block_version_idx").on(table.versionId),
	],
);

export const comment = sqliteTable(
	"comment",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plan.id, { onDelete: "cascade" }),
		versionId: text("version_id")
			.notNull()
			.references(() => planVersion.id, { onDelete: "cascade" }),
		blockKey: text("block_key"),
		parentId: text("parent_id"),
		body: text("body").notNull(),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id),
		agentAssisted: integer("agent_assisted", { mode: "boolean" }).notNull().default(false),
		resolvedAt: timestamp("resolved_at"),
		createdAt: createdAt(),
	},
	(table) => [index("comment_plan_idx").on(table.planId), index("comment_version_idx").on(table.versionId)],
);

export const decision = sqliteTable(
	"decision",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plan.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		status: text("status", { enum: ["open", "resolved"] })
			.notNull()
			.default("open"),
		resolution: text("resolution"),
		ownerId: text("owner_id").references(() => user.id),
		resolvedById: text("resolved_by_id").references(() => user.id),
		resolvedAt: timestamp("resolved_at"),
	},
	(table) => [
		unique("decision_plan_key").on(table.planId, table.key),
		check("decision_status_ck", sql`${table.status} in ('open','resolved')`),
	],
);

export const approval = sqliteTable(
	"approval",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plan.id, { onDelete: "cascade" }),
		versionId: text("version_id")
			.notNull()
			.references(() => planVersion.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		createdAt: createdAt(),
	},
	(table) => [unique("approval_version_user").on(table.versionId, table.userId)],
);

export const membership = sqliteTable(
	"membership",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["owner", "member"] }).notNull(),
	},
	(table) => [
		unique("membership_user_workspace").on(table.userId, table.workspaceId),
		check("membership_role_ck", sql`${table.role} in ('owner','member')`),
	],
);

export const apiToken = sqliteTable("api_token", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	// First characters of the plaintext, kept so the settings list can name the
	// token you are about to revoke. Nullable only because tokens issued before
	// this column existed cannot be recovered from their hash.
	prefix: text("prefix"),
	// Nullable for the same reason, and backfilled by the migration: every code
	// path that mints a token now sets an expiry, so null means "pre-expiry row"
	// rather than "never expires".
	expiresAt: timestamp("expires_at"),
	lastUsedAt: timestamp("last_used_at"),
});

/**
 * One in-flight `plantifiles login`. The CLI holds the device code; the browser
 * only ever sees the short user code, so the approving session cannot leak the
 * credential by shoulder-surfing or by pasting a URL into a chat.
 */
export const cliAuthRequest = sqliteTable(
	"cli_auth_request",
	{
		id: text("id").primaryKey(),
		deviceCodeHash: text("device_code_hash").notNull().unique(),
		userCode: text("user_code").notNull().unique(),
		tokenName: text("token_name").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		// Both stay null until a signed-in browser approves. `issuedToken` holds
		// the plaintext for the seconds between approval and the CLI's next poll,
		// which deletes the row; nothing else can read it, because the reader must
		// present the device code.
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		issuedToken: text("issued_token"),
		createdAt: createdAt(),
	},
	(table) => [index("cli_auth_request_expires_idx").on(table.expiresAt)],
);
