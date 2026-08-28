CREATE TABLE `failure_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`failure_public_id` text NOT NULL,
	`schema` text NOT NULL,
	`content_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`failure_public_id`) REFERENCES `failures`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_artifacts_public_id_unique` ON `failure_artifacts` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `failure_artifacts_failure_public_id_unique` ON `failure_artifacts` (`failure_public_id`);--> statement-breakpoint
CREATE TABLE `patch_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`failure_public_id` text NOT NULL,
	`patch_id` text NOT NULL,
	`patch_name` text NOT NULL,
	`spec_yaml` text NOT NULL,
	`fixture_json` text NOT NULL,
	`attestation_json` text NOT NULL,
	`validator_public_key` text NOT NULL,
	`signature` text NOT NULL,
	`pass_rate_bps` integer NOT NULL,
	`status` text DEFAULT 'verified' NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`failure_public_id`) REFERENCES `failures`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patch_submissions_public_id_unique` ON `patch_submissions` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_patch_submissions_failure_status_submitted` ON `patch_submissions` (`failure_public_id`,`status`,`submitted_at`);