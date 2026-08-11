CREATE TABLE `slack_installation` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`team_id` text NOT NULL,
	`team_name` text,
	`bot_user_id` text,
	`encrypted_access_token` text NOT NULL,
	`installed_by_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`installed_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_installation_workspace_id_unique` ON `slack_installation` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `slack_installation_team_id_unique` ON `slack_installation` (`team_id`);