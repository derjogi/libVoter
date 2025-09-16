ALTER TABLE `candidates` RENAME COLUMN `bio` TO `candidate_statement`;--> statement-breakpoint
ALTER TABLE `candidates` RENAME COLUMN `policies` TO `key_positions`;--> statement-breakpoint
ALTER TABLE `candidates` ADD `why` text;--> statement-breakpoint
ALTER TABLE `candidates` ADD `key_skills` text;--> statement-breakpoint
ALTER TABLE `candidates` ADD `top_issues` text;--> statement-breakpoint
ALTER TABLE `candidates` ADD `supporting_links` text;