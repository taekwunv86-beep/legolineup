CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`attempt_no` integer NOT NULL,
	`client_uuid` text NOT NULL,
	`started_at_ms` integer NOT NULL,
	`stopped_at_ms` integer,
	`duration_ms` integer,
	`assembly_order_1` text,
	`assembly_order_2` text,
	`assembly_order_3` text,
	`assembly_order_4` text,
	`assembly_order_5` text,
	`turn_t` integer,
	`turn_extra` integer,
	`is_success` integer DEFAULT 0 NOT NULL,
	`success_marked_by` integer,
	`success_marked_at_ms` integer,
	`user_notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`success_marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_client_uuid_unique` ON `attempts` (`client_uuid`);--> statement-breakpoint
CREATE INDEX `idx_attempts_team_success_duration` ON `attempts` (`team_id`,`is_success`,`duration_ms`);--> statement-breakpoint
CREATE INDEX `idx_attempts_team_no` ON `attempts` (`team_id`,`attempt_no`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`target_table` text,
	`target_id` integer,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ft_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ft_notes_team` ON `ft_notes` (`team_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`time_limit_seconds` integer DEFAULT 900 NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`share_token` text NOT NULL,
	`started_at_ms` integer,
	`ended_at_ms` integer,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_share_token_unique` ON `rounds` (`share_token`);--> statement-breakpoint
CREATE INDEX `idx_rounds_status` ON `rounds` (`status`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`last_heartbeat_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_teams_round_username` ON `teams` (`round_id`,`username`);--> statement-breakpoint
CREATE INDEX `idx_teams_round` ON `teams` (`round_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);