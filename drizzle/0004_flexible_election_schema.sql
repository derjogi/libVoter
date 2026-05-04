CREATE TABLE `candidacies` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`race_id` text NOT NULL,
	`person_id` text NOT NULL,
	`party_id` text,
	`list_rank` integer,
	`candidate_statement` text,
	`why` text,
	`key_skills` text,
	`top_issues` text,
	`key_positions` text,
	`supporting_links` text,
	`legacy_candidate_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`race_id`) REFERENCES `races`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`party_id`) REFERENCES `election_parties`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`legacy_candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidacies_election_race_person_unique` ON `candidacies` (`election_id`,`race_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `election_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`name` text NOT NULL,
	`leader` text,
	`platform` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `election_parties_election_name_unique` ON `election_parties` (`election_id`,`name`);--> statement-breakpoint
CREATE TABLE `elections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`region` text,
	`year` integer NOT NULL,
	`type` text NOT NULL,
	`voting_system` text,
	`key_topics` text,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`photo_url` text,
	`socials` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `races` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`district` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `elections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `races_election_kind_district_unique` ON `races` (`election_id`,`kind`,`district`);--> statement-breakpoint
DROP INDEX `name_ward_unique`;