DROP INDEX `case_claims_failure_public_id_unique`;--> statement-breakpoint
ALTER TABLE `case_claims` ADD `solver_profile_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `case_claims` ADD `solver_identity_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `case_claims` ADD `identity_status` text DEFAULT 'profile_submitted' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_case_claims_failure_status_claimed` ON `case_claims` (`failure_public_id`,`status`,`claimed_at`);--> statement-breakpoint
ALTER TABLE `patch_submissions` ADD `verification_mode` text DEFAULT 'registry_replay' NOT NULL;--> statement-breakpoint
ALTER TABLE `patch_submissions` ADD `independent_passed_cases` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `patch_submissions` ADD `independent_total_cases` integer DEFAULT 0 NOT NULL;