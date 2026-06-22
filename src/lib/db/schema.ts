import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// === Legacy / current candidates table ===
//
// `ward` is kept for the Auckland 2025 dataset so the running app keeps
// working through the additive migration phase (spec 002). Newer code should
// read seats from the `races` table via `candidacies` instead.
export const candidates = sqliteTable("candidates", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  party: text("party"),
  ward: text("ward").notNull(),
  candidate_statement: text("candidate_statement"),
  key_positions: text("key_positions", { mode: "json" }).$type<
    Record<string, string>
  >(),
  why: text("why"),
  key_skills: text("key_skills"),
  top_issues: text("top_issues"),
  supporting_links: text("supporting_links", { mode: "json" }).$type<
    string[]
  >(),
  photo_url: text("photo_url"),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
});

// === Generic election data model (spec 002) ===
//
//   elections 1───n races 1───n candidacies n───1 candidates
//                              n───1 parties (optional)
//
// `kind` on a race describes the seat type so the same table can model an
// Auckland ward, a NZ electorate, a list seat, a mayor, etc.

export const elections = sqliteTable("elections", {
  id: text("id").primaryKey(), // e.g. 'auckland-2025', 'nz-2026'
  name: text("name").notNull(),
  country: text("country").notNull(),
  region: text("region"),
  year: integer("year").notNull(),
  type: text("type").notNull(), // 'local' | 'national' | ...
  votingSystem: text("voting_system"), // 'fpp' | 'mmp' | ...
  keyTopics: text("key_topics", { mode: "json" }).$type<string[]>(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const races = sqliteTable(
  "races",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'mayor' | 'ward' | 'electorate' | 'list' | 'councillor'
    name: text("name").notNull(), // human-readable label, e.g. 'Albany Ward'
    district: text("district"), // ward / electorate name; null for list seats
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    raceUnique: uniqueIndex("races_election_kind_district_unique").on(
      t.electionId,
      t.kind,
      t.district,
    ),
  }),
);

// Parties, scoped to an election so manifestos can differ year-to-year.
export const electionParties = sqliteTable(
  "election_parties",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    leader: text("leader"),
    platform: text("platform", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    partyUnique: uniqueIndex("election_parties_election_name_unique").on(
      t.electionId,
      t.name,
    ),
  }),
);

// The person, election-agnostic.
export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  socials: text("socials", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Join row: one (election, race, person) candidacy with their per-race pitch.
export const candidacies = sqliteTable(
  "candidacies",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    raceId: text("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    partyId: text("party_id").references(() => electionParties.id, {
      onDelete: "set null",
    }),
    listRank: integer("list_rank"),
    candidateStatement: text("candidate_statement"),
    why: text("why"),
    keySkills: text("key_skills"),
    topIssues: text("top_issues"),
    keyPositions: text("key_positions", { mode: "json" }).$type<
      Record<string, string>
    >(),
    supportingLinks: text("supporting_links", { mode: "json" }).$type<
      string[]
    >(),
    legacyCandidateId: integer("legacy_candidate_id").references(
      () => candidates.id,
    ),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    candidacyUnique: uniqueIndex("candidacies_election_race_person_unique").on(
      t.electionId,
      t.raceId,
      t.personId,
    ),
  }),
);

// === Evidence sources (spec 009 Phase 2) ===
//
// Canonical store of scraped source documents — a candidate's voting record,
// parliamentary statements, social posts, a party's manifesto / policy pages,
// etc. This is the durable record we re-chunk and embed into the vector store
// (Phase 4); keeping the full `content` here lets us re-embed at will and show
// the original passage in-app, while `url` powers "link out to source".
//
// `candidateId` / `partyId` are intentionally SOFT references (no FK): during
// the spec-002 migration candidate identity spans both the legacy `candidates`
// table (integer id, stringified here) and the generic `people` / `candidacies`
// model, and parties span `parties` / `electionParties`. Corpus adapters may
// leave both null and attach people/parties later. Harden into FKs once the
// generic model is the single source of truth.
export const SOURCE_TYPES = [
  "voting_record",
  "hansard",
  "statement",
  "social",
  "manifesto",
  "party_policy",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const evidenceSources = sqliteTable(
  "evidence_sources",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    // Soft references (see table comment); corpus documents may leave both null.
    candidateId: text("candidate_id"),
    partyId: text("party_id"),
    // Stable identity within the source system. Unlike URL/content hash, this
    // survives publication revisions and URL changes.
    sourceAdapter: text("source_adapter"),
    externalId: text("external_id"),
    documentType: text("document_type"),
    sourceStatus: text("source_status"),
    parliamentNumber: integer("parliament_number"),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    title: text("title"),
    url: text("url"),
    author: text("author"),
    // Date of the source content itself (e.g. when the speech was given),
    // distinct from when we scraped it.
    publishedAt: integer("published_at", { mode: "timestamp" }),
    // Cleaned full text — source of truth for chunking + in-app expansion.
    content: text("content").notNull(),
    // Change-detection / dedup key for the background refresher (Phase 3).
    contentHash: text("content_hash"),
    fetchedAt: integer("fetched_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byCandidate: index("evidence_sources_candidate_idx").on(t.candidateId),
    byParty: index("evidence_sources_party_idx").on(t.partyId),
    byElection: index("evidence_sources_election_idx").on(t.electionId),
    byExternalDocument: uniqueIndex(
      "evidence_sources_adapter_external_id_unique",
    ).on(t.sourceAdapter, t.externalId),
  }),
);

// === Legacy parties table (kept for backward compat) ===
export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  platformData: text("platform_data", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }),
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Zod schemas for validation
export const insertCandidateSchema = createInsertSchema(candidates);
export const selectCandidateSchema = createSelectSchema(candidates);
export const insertPartySchema = createInsertSchema(parties);
export const selectPartySchema = createSelectSchema(parties);
export const insertAppSettingSchema = createInsertSchema(appSettings);
export const selectAppSettingSchema = createSelectSchema(appSettings);

export const insertElectionSchema = createInsertSchema(elections);
export const selectElectionSchema = createSelectSchema(elections);
export const insertRaceSchema = createInsertSchema(races);
export const selectRaceSchema = createSelectSchema(races);
export const insertElectionPartySchema = createInsertSchema(electionParties);
export const selectElectionPartySchema = createSelectSchema(electionParties);
export const insertPersonSchema = createInsertSchema(people);
export const selectPersonSchema = createSelectSchema(people);
export const insertCandidacySchema = createInsertSchema(candidacies);
export const selectCandidacySchema = createSelectSchema(candidacies);
export const insertEvidenceSourceSchema = createInsertSchema(evidenceSources);
export const selectEvidenceSourceSchema = createSelectSchema(evidenceSources);

// Types are automatically inferred from the schema
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

export type Election = typeof elections.$inferSelect;
export type NewElection = typeof elections.$inferInsert;
export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
export type ElectionParty = typeof electionParties.$inferSelect;
export type NewElectionParty = typeof electionParties.$inferInsert;
export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Candidacy = typeof candidacies.$inferSelect;
export type NewCandidacy = typeof candidacies.$inferInsert;
export type EvidenceSource = typeof evidenceSources.$inferSelect;
export type NewEvidenceSource = typeof evidenceSources.$inferInsert;
