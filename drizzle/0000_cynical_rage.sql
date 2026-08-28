CREATE TABLE `failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`title` text NOT NULL,
	`observed_behavior` text NOT NULL,
	`expected_behavior` text NOT NULL,
	`runtime` text NOT NULL,
	`category` text DEFAULT 'COMMUNITY' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failures_public_id_unique` ON `failures` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_failures_submitted_at` ON `failures` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_failures_status_submitted_at` ON `failures` (`status`,`submitted_at`);