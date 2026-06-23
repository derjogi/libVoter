CREATE TABLE `hansard_document_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_source_id` text NOT NULL,
	`party_id` text,
	`party_name` text NOT NULL,
	`stance` text NOT NULL,
	`vote_count` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_source_id`) REFERENCES `evidence_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`party_id`) REFERENCES `election_parties`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hansard_document_parties_evidence_idx` ON `hansard_document_parties` (`evidence_source_id`);--> statement-breakpoint
CREATE INDEX `hansard_document_parties_party_idx` ON `hansard_document_parties` (`party_id`);--> statement-breakpoint
CREATE TABLE `hansard_document_people` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_source_id` text NOT NULL,
	`person_id` text NOT NULL,
	`official_id` text,
	`person_name` text NOT NULL,
	`role` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_source_id`) REFERENCES `evidence_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hansard_document_people_evidence_idx` ON `hansard_document_people` (`evidence_source_id`);--> statement-breakpoint
CREATE INDEX `hansard_document_people_person_idx` ON `hansard_document_people` (`person_id`);