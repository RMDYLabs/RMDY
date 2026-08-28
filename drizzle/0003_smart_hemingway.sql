PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bounty_pledges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`failure_public_id` text NOT NULL,
	`sponsor_name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'USDT_SOL' NOT NULL,
	`note` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`failure_public_id`) REFERENCES `failures`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_bounty_pledges`("id", "public_id", "failure_public_id", "sponsor_name", "amount", "currency", "note", "status", "created_at") SELECT "id", "public_id", "failure_public_id", "sponsor_name", "amount", "currency", "note", "status", "created_at" FROM `bounty_pledges`;--> statement-breakpoint
DROP TABLE `bounty_pledges`;--> statement-breakpoint
ALTER TABLE `__new_bounty_pledges` RENAME TO `bounty_pledges`;--> statement-breakpoint
UPDATE `bounty_pledges` SET `currency` = 'USDT_SOL', `status` = 'proposed' WHERE `currency` = 'APATCH_CREDITS' OR `status` = 'pledged';--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bounty_pledges_public_id_unique` ON `bounty_pledges` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_bounty_pledges_failure_status_created` ON `bounty_pledges` (`failure_public_id`,`status`,`created_at`);
