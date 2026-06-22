ALTER TABLE `evidence_sources` ADD `source_adapter` text;--> statement-breakpoint
ALTER TABLE `evidence_sources` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `evidence_sources` ADD `document_type` text;--> statement-breakpoint
ALTER TABLE `evidence_sources` ADD `source_status` text;--> statement-breakpoint
ALTER TABLE `evidence_sources` ADD `parliament_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_sources_adapter_external_id_unique` ON `evidence_sources` (`source_adapter`,`external_id`);