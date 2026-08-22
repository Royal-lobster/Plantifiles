CREATE TABLE `cli_auth_request` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code` text NOT NULL,
	`token_name` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_id` text,
	`issued_token` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_auth_request_device_code_hash_unique` ON `cli_auth_request` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `cli_auth_request_user_code_unique` ON `cli_auth_request` (`user_code`);--> statement-breakpoint
CREATE INDEX `cli_auth_request_expires_idx` ON `cli_auth_request` (`expires_at`);--> statement-breakpoint
CREATE TABLE `workspace_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`accepted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workspace_invite_role_ck" CHECK("workspace_invite"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invite_token_hash_unique` ON `workspace_invite` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_invite_workspace_idx` ON `workspace_invite` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `api_token` ADD `prefix` text;--> statement-breakpoint
ALTER TABLE `api_token` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `workspace` ADD `personal_user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_personal_user_id_unique` ON `workspace` (`personal_user_id`);
--> statement-breakpoint
-- No token minted before this migration carried an expiry. Give every survivor
-- the same 90-day window new tokens get, counted from now, so the change cannot
-- leave an immortal credential behind.
UPDATE `api_token` SET `expires_at` = unixepoch() + 7776000 WHERE `expires_at` IS NULL;