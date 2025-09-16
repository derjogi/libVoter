PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_candidates` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`party` text,
	`ward` text NOT NULL,
	`bio` text,
	`policies` text,
	`email` text,
	`phone` text,
	`photo_url` text,
	`website` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_candidates`("id", "name", "party", "ward", "bio", "policies", "email", "phone", "photo_url", "website", "created_at") SELECT "id", "name", "party", "ward", "bio", "policies", "email", "phone", "photo_url", "website", "created_at" FROM `candidates`;--> statement-breakpoint
DROP TABLE `candidates`;--> statement-breakpoint
ALTER TABLE `__new_candidates` RENAME TO `candidates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `name_ward_unique` ON `candidates` (`name`,`ward`);