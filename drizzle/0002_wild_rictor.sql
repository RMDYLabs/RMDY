CREATE TABLE `bounty_pledges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`failure_public_id` text NOT NULL,
	`sponsor_name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'APATCH_CREDITS' NOT NULL,
	`note` text NOT NULL,
	`status` text DEFAULT 'pledged' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`failure_public_id`) REFERENCES `failures`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bounty_pledges_public_id_unique` ON `bounty_pledges` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_bounty_pledges_failure_status_created` ON `bounty_pledges` (`failure_public_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `case_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`failure_public_id` text NOT NULL,
	`solver_name` text NOT NULL,
	`approach` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`claim_token_hash` text NOT NULL,
	`claimed_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`failure_public_id`) REFERENCES `failures`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_claims_public_id_unique` ON `case_claims` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_claims_failure_public_id_unique` ON `case_claims` (`failure_public_id`);--> statement-breakpoint
CREATE TABLE `write_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bucket` text NOT NULL,
	`action` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`window_start` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_write_limits_bucket_action` ON `write_limits` (`bucket`,`action`);