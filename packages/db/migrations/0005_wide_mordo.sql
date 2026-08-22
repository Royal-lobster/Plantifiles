DROP TABLE `account`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
DROP TABLE `workspace_invite`;--> statement-breakpoint
-- D1 keeps foreign-key actions enabled inside migrations, so dropping the
-- workspace table would cascade through every plan and erase its history.
-- Preserve the dependent rows in constraint-free tables and restore them after
-- the workspace projection table has been rebuilt.
CREATE TABLE `__backup_membership` AS SELECT * FROM `membership`;--> statement-breakpoint
CREATE TABLE `__backup_plan` AS SELECT * FROM `plan`;--> statement-breakpoint
CREATE TABLE `__backup_plan_version` AS SELECT * FROM `plan_version`;--> statement-breakpoint
CREATE TABLE `__backup_plan_block` AS SELECT * FROM `plan_block`;--> statement-breakpoint
CREATE TABLE `__backup_comment` AS SELECT * FROM `comment`;--> statement-breakpoint
CREATE TABLE `__backup_decision` AS SELECT * FROM `decision`;--> statement-breakpoint
CREATE TABLE `__backup_approval` AS SELECT * FROM `approval`;--> statement-breakpoint
CREATE TABLE `__new_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_organization_id` text,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_workspace`("id", "clerk_organization_id", "slug", "name") SELECT "id", CASE WHEN "id" = 'workspace_demo' THEN 'org_local_demo' ELSE NULL END, "slug", "name" FROM `workspace`;--> statement-breakpoint
DROP TABLE `workspace`;--> statement-breakpoint
ALTER TABLE `__new_workspace` RENAME TO `workspace`;--> statement-breakpoint
INSERT INTO `plan` SELECT * FROM `__backup_plan`;--> statement-breakpoint
INSERT INTO `plan_version` SELECT * FROM `__backup_plan_version`;--> statement-breakpoint
INSERT INTO `plan_block` SELECT * FROM `__backup_plan_block`;--> statement-breakpoint
INSERT INTO `comment` SELECT * FROM `__backup_comment`;--> statement-breakpoint
INSERT INTO `decision` SELECT * FROM `__backup_decision`;--> statement-breakpoint
INSERT INTO `approval` SELECT * FROM `__backup_approval`;--> statement-breakpoint
INSERT INTO `membership` SELECT * FROM `__backup_membership`;--> statement-breakpoint
DROP TABLE `__backup_membership`;--> statement-breakpoint
DROP TABLE `__backup_plan`;--> statement-breakpoint
DROP TABLE `__backup_plan_version`;--> statement-breakpoint
DROP TABLE `__backup_plan_block`;--> statement-breakpoint
DROP TABLE `__backup_comment`;--> statement-breakpoint
DROP TABLE `__backup_decision`;--> statement-breakpoint
DROP TABLE `__backup_approval`;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_clerk_organization_id_unique` ON `workspace` (`clerk_organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);--> statement-breakpoint
ALTER TABLE `user` ADD `clerk_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_clerk_user_id_unique` ON `user` (`clerk_user_id`);