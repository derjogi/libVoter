CREATE TABLE `evidence_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`candidate_id` text,
	`party_id` text,
	`source_type` text NOT NULL,
	`title` text,
	`url` text,
	`author` text,
	`published_at` integer,
	`content` text NOT NULL,
	`content_hash` text,
	`fetched_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_sources_candidate_idx` ON `evidence_sources` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `evidence_sources_party_idx` ON `evidence_sources` (`party_id`);--> statement-breakpoint
CREATE INDEX `evidence_sources_election_idx` ON `evidence_sources` (`election_id`);