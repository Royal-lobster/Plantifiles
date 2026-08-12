DROP TABLE `slack_installation`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "membership_role_ck" CHECK("__new_membership"."role" in ('owner','member'))
);
--> statement-breakpoint
INSERT INTO `__new_membership`("id", "user_id", "workspace_id", "role") SELECT "id", "user_id", "workspace_id", "role" FROM `membership`;--> statement-breakpoint
DROP TABLE `membership`;--> statement-breakpoint
ALTER TABLE `__new_membership` RENAME TO `membership`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_workspace` ON `membership` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `__backup_plan_version` AS SELECT * FROM `plan_version`;--> statement-breakpoint
CREATE TABLE `__backup_plan_block` AS SELECT * FROM `plan_block`;--> statement-breakpoint
CREATE TABLE `__backup_comment` AS SELECT * FROM `comment`;--> statement-breakpoint
CREATE TABLE `__backup_decision` AS SELECT * FROM `decision`;--> statement-breakpoint
CREATE TABLE `__backup_approval` AS SELECT * FROM `approval`;--> statement-breakpoint
CREATE TABLE `__new_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'workspace' NOT NULL,
	`public_slug` text,
	`created_by_id` text NOT NULL,
	`current_version_id` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_status_ck" CHECK("__new_plan"."status" in ('draft','in_review','approved','archived')),
	CONSTRAINT "plan_visibility_ck" CHECK("__new_plan"."visibility" in ('private','workspace','public'))
);
--> statement-breakpoint
INSERT INTO `__new_plan`("id", "workspace_id", "slug", "title", "status", "visibility", "public_slug", "created_by_id", "current_version_id", "updated_at") SELECT "id", "workspace_id", "slug", "title", "status", "visibility", "public_slug", "created_by_id", "current_version_id", "updated_at" FROM `plan`;--> statement-breakpoint
DROP TABLE `plan`;--> statement-breakpoint
ALTER TABLE `__new_plan` RENAME TO `plan`;--> statement-breakpoint
INSERT INTO `plan_version`("id", "plan_id", "number", "source", "change_summary", "change_summary_prose", "lint_score", "lint_report", "lint_overridden", "author_id", "agent_name", "agent_prompt", "created_at") SELECT "id", "plan_id", "number", "source", "change_summary", "change_summary_prose", "lint_score", "lint_report", "lint_overridden", "author_id", "agent_name", "agent_prompt", "created_at" FROM `__backup_plan_version`;--> statement-breakpoint
INSERT INTO `plan_block`("id", "version_id", "key", "kind", "ordinal", "content_hash") SELECT "id", "version_id", "key", "kind", "ordinal", "content_hash" FROM `__backup_plan_block`;--> statement-breakpoint
INSERT INTO `comment`("id", "plan_id", "version_id", "block_key", "parent_id", "body", "author_id", "agent_assisted", "resolved_at", "created_at") SELECT "id", "plan_id", "version_id", "block_key", "parent_id", "body", "author_id", "agent_assisted", "resolved_at", "created_at" FROM `__backup_comment`;--> statement-breakpoint
INSERT INTO `decision`("id", "plan_id", "key", "status", "resolution", "owner_id", "resolved_by_id", "resolved_at") SELECT "id", "plan_id", "key", "status", "resolution", "owner_id", "resolved_by_id", "resolved_at" FROM `__backup_decision`;--> statement-breakpoint
INSERT INTO `approval`("id", "plan_id", "version_id", "user_id", "created_at") SELECT "id", "plan_id", "version_id", "user_id", "created_at" FROM `__backup_approval`;--> statement-breakpoint
DROP TABLE `__backup_plan_version`;--> statement-breakpoint
DROP TABLE `__backup_plan_block`;--> statement-breakpoint
DROP TABLE `__backup_comment`;--> statement-breakpoint
DROP TABLE `__backup_decision`;--> statement-breakpoint
DROP TABLE `__backup_approval`;--> statement-breakpoint
CREATE UNIQUE INDEX `plan_public_slug_unique` ON `plan` (`public_slug`);--> statement-breakpoint
CREATE INDEX `plan_workspace_updated_idx` ON `plan` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_workspace_slug` ON `plan` (`workspace_id`,`slug`);--> statement-breakpoint
ALTER TABLE `plan_version` DROP COLUMN `change_summary_prose`;