CREATE TABLE `approval` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`version_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `plan_version`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_version_user` ON `approval` (`version_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`version_id` text NOT NULL,
	`block_key` text,
	`parent_id` text,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`agent_assisted` integer DEFAULT false NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `plan_version`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comment_plan_idx` ON `comment` (`plan_id`);--> statement-breakpoint
CREATE INDEX `comment_version_idx` ON `comment` (`version_id`);--> statement-breakpoint
CREATE TABLE `decision` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`owner_id` text,
	`resolved_by_id` text,
	`resolved_at` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "decision_status_ck" CHECK("decision"."status" in ('open','resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_plan_key` ON `decision` (`plan_id`,`key`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "membership_role_ck" CHECK("membership"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_workspace` ON `membership` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `plan` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'workspace' NOT NULL,
	`public_slug` text,
	`created_by_id` text NOT NULL,
	`current_version_id` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_status_ck" CHECK("plan"."status" in ('draft','in_review','approved','archived')),
	CONSTRAINT "plan_visibility_ck" CHECK("plan"."visibility" in ('private','workspace','public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_public_slug_unique` ON `plan` (`public_slug`);--> statement-breakpoint
CREATE INDEX `plan_workspace_updated_idx` ON `plan` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_workspace_slug` ON `plan` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `plan_block` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content_hash` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `plan_version`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_block_version_idx` ON `plan_block` (`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_block_version_key` ON `plan_block` (`version_id`,`key`);--> statement-breakpoint
CREATE TABLE `plan_version` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`number` integer NOT NULL,
	`source` text NOT NULL,
	`change_summary` text,
	`lint_score` integer NOT NULL,
	`lint_report` text NOT NULL,
	`lint_overridden` integer DEFAULT false NOT NULL,
	`author_id` text NOT NULL,
	`agent_name` text,
	`agent_prompt` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_version_plan_idx` ON `plan_version` (`plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_version_number` ON `plan_version` (`plan_id`,`number`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_clerk_user_id_unique` ON `user` (`clerk_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_organization_id` text,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_clerk_organization_id_unique` ON `workspace` (`clerk_organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);