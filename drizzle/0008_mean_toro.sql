CREATE TABLE `hansard_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_source_id` text NOT NULL,
	`person_id` text NOT NULL,
	`official_id` text,
	`person_name` text NOT NULL,
	`role` text NOT NULL,
	`source` text NOT NULL,
	`utterance_sequence` integer,
	`confidence` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_source_id`) REFERENCES `evidence_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hansard_mentions_evidence_idx` ON `hansard_mentions` (`evidence_source_id`);--> statement-breakpoint
CREATE INDEX `hansard_mentions_person_idx` ON `hansard_mentions` (`person_id`);--> statement-breakpoint
CREATE TABLE `hansard_utterances` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_source_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`speaker_name` text,
	`speaker_role` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_source_id`) REFERENCES `evidence_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hansard_utterances_evidence_idx` ON `hansard_utterances` (`evidence_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hansard_utterances_evidence_sequence_unique` ON `hansard_utterances` (`evidence_source_id`,`sequence`);