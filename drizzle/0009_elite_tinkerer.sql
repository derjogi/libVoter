CREATE TABLE `corpus_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`corpus_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`content_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	CONSTRAINT "corpus_revisions_status_check" CHECK("corpus_revisions"."status" in ('draft', 'accepted', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `corpus_revisions_key_sequence_unique` ON `corpus_revisions` (`corpus_key`,`sequence`);--> statement-breakpoint
CREATE INDEX `corpus_revisions_status_idx` ON `corpus_revisions` (`status`);--> statement-breakpoint
CREATE TABLE `evidence_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`corpus_revision_id` text NOT NULL,
	`evidence_source_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`candidacy_id` text,
	`person_id` text,
	`official_party_id` text,
	`source_lineage_key` text NOT NULL,
	`independence_key` text NOT NULL,
	`content_revision` text NOT NULL,
	`content_hash` text NOT NULL,
	`text` text NOT NULL,
	`span_start` integer NOT NULL,
	`span_end` integer NOT NULL,
	`status` text NOT NULL,
	`published_at` integer,
	`invalidated_at` integer,
	`invalidation_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`corpus_revision_id`) REFERENCES `corpus_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_source_id`) REFERENCES `evidence_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`official_party_id`) REFERENCES `election_parties`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_passages_span_check" CHECK("evidence_passages"."span_start" >= 0 and "evidence_passages"."span_end" > "evidence_passages"."span_start"),
	CONSTRAINT "evidence_passages_subject_identity_check" CHECK(("evidence_passages"."subject_type" = 'candidacy' and "evidence_passages"."candidacy_id" is not null and "evidence_passages"."person_id" is null and "evidence_passages"."official_party_id" is null)
        or ("evidence_passages"."subject_type" = 'person' and "evidence_passages"."candidacy_id" is null and "evidence_passages"."person_id" is not null and "evidence_passages"."official_party_id" is null)
        or ("evidence_passages"."subject_type" = 'official_party' and "evidence_passages"."candidacy_id" is null and "evidence_passages"."person_id" is null and "evidence_passages"."official_party_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `evidence_passages_revision_status_idx` ON `evidence_passages` (`corpus_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `evidence_passages_candidacy_idx` ON `evidence_passages` (`candidacy_id`);--> statement-breakpoint
CREATE INDEX `evidence_passages_person_idx` ON `evidence_passages` (`person_id`);--> statement-breakpoint
CREATE INDEX `evidence_passages_official_party_idx` ON `evidence_passages` (`official_party_id`);--> statement-breakpoint
CREATE INDEX `evidence_passages_lineage_idx` ON `evidence_passages` (`source_lineage_key`,`independence_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_passages_revision_source_span_unique` ON `evidence_passages` (`corpus_revision_id`,`evidence_source_id`,`span_start`,`span_end`);