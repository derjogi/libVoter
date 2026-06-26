---
status: in-progress
created: 2026-05-03
priority: high
tags:
- schema
- refactor
depends_on:
- '001'
created_at: 2026-05-03T01:39:17.240936252Z
updated_at: 2026-06-26T10:03:35Z
---

# Flexible election schema (elections, races, parties, candidacies)

> **Status**: planned · **Priority**: high · **Created**: 2026-05-03

## Overview

Today the DB hard-codes the Auckland 2025 ward model:
[`src/lib/db/schema.ts`](../../src/lib/db/schema.ts) has `candidates.ward
TEXT NOT NULL`, treats `party` as plain text, and the `parties` table is
defined but never written to. Only one election fits in the DB at a time;
switching to NZ 2026 (national, MMP, electorate + list seats) requires
wiping the data.

This spec generalises the schema so any election can be expressed as data,
without touching application code. The hard-coded `electionConfig` in
[`src/lib/config/election.ts`](../../src/lib/config/election.ts) stays —
per the maintainer's decision, runtime config does not need to be a
registry yet — but the *data model* must be flexible.

## Design

Target shape:

```diagram
╭─────────────╮  1───n  ╭─────────────╮  1───n  ╭───────────────╮
│  elections  │────────▶│   races     │────────▶│  candidacies  │
│  id, name,  │         │ id,         │         │ id,           │
│  country,   │         │ election_id,│         │ election_id,  │
│  region,    │         │ kind,       │         │ race_id,      │
│  year,      │         │ name,       │         │ candidate_id, │
│  type,      │         │ district    │         │ party_id?,    │
│  voting_sys │         ╰─────────────╯         │ list_rank?    │
╰─────────────╯                                 ╰───────────────╯
                        ╭─────────────╮                ▲
                        │   parties   │  1───n         │ n──1
                        │ id, name,   │────────────────┤
                        │ election_id,│                │
                        │ leader,     │         ╭───────────────╮
                        │ platform    │         │  candidates   │
                        ╰─────────────╯         │ id, name,     │
                                                │ bio, photo,   │
                                                │ socials       │
                                                ╰───────────────╯
```

- **`elections`**: id (`'auckland-2025'`, `'nz-2026'`), country, region,
  year, type, voting_system, key_topics JSON, description, created_at.
- **`races`**: a single contestable seat or set of seats. `kind` ∈
  `mayor | ward | electorate | list | councillor`. `district` is the
  seat name (e.g. ward name, electorate name).
- **`parties`**: id, election_id, name, leader, platform JSON. Tied to
  one election so manifestos can be per-election.
- **`candidates`**: just the *person* — name, bio, photo, socials.
  Election-agnostic; can appear in multiple elections via candidacies.
- **`candidacies`**: the join row. `(election_id, race_id, candidate_id)`
  with optional `party_id` (independents allowed) and `list_rank` (for
  list seats under MMP).

Notes:

- **Candidates persist across elections.** A name appearing in both
  Auckland 2025 and NZ 2026 should be one row in `candidates` with two
  candidacies. (We can defer dedup logic; new rows are fine for v1.)
- **Bio fields stay on `candidates`.** The current
  `candidate_statement / why / key_skills / top_issues / key_positions`
  are election-specific position statements — those move to
  `candidacies` (a candidate's pitch is per-race).
- The hard-coded `ward = 'Mayor'` carve-out in
  [`actions/database.ts`](../../src/lib/actions/database.ts#L132-L146)
  becomes `races.kind = 'mayor'` for the relevant election.

## Plan

- [ ] Sketch the new tables in [`src/lib/db/schema.ts`](../../src/lib/db/schema.ts)
      using Drizzle, keeping the existing tables alongside (no destructive
      change yet).
- [ ] Generate a migration: `bunx drizzle-kit generate`.
- [ ] Write a one-off Bun script under `scripts/migrate-to-races.ts` that
      reads existing rows and produces:
        - one `elections` row (`'auckland-2025'`),
        - one `races` row per distinct `ward`,
        - one `candidates` row per distinct `name`,
        - one `candidacies` row joining them,
      then verifies counts.
- [x] Update [`actions/database.ts`](../../src/lib/actions/database.ts) so
      active candidate loading uses `races.kind` and `races.district` instead
      of `candidates.ward` (`getCandidatesForSeat`). Legacy ward / mayor
      helpers remain for compatibility during the additive migration.
- [ ] Update [`vector-store.ts`](../../src/lib/server/rag/vector-store.ts)
      so each Document carries `{ election_id, race_id, party_id }` in
      metadata, so retrievals can be filtered.
- [ ] Add `electionId` parameter to `PromptManager` /
      `selectNextComponent` so multi-election deployments are possible
      later (caller passes `electionConfig.id`).
- [ ] Drop `candidates.ward` column in a follow-up migration once nothing
      reads it (don't do this in the same migration as the additions).

## Test

- [ ] After running the backfill script, the row counts match:
        - `select count(distinct ward) from candidates` =
          `select count(*) from races where election_id = 'auckland-2025'`
        - `select count(*) from candidates_old` =
          `select count(*) from candidacies where election_id = 'auckland-2025'`
- [x] The existing UI (ward/electorate dropdown → candidate list) loads
      candidates through the new schema. Covered by
      `tests/unit/db-schema.test.ts` regression for NZ 2026 electorate
      candidacies excluding Auckland mayors.
- [ ] `getCandidatesByWard()` and `getMayorCandidates()` return the same
      set of names as before the migration (snapshot test).

## Notes

- This is a foundational spec; specs 003, 005 build on top.
- Drizzle's `references()` should be used so foreign keys are enforced at
  the SQLite level.
- Keep the migration **additive then subtractive** — never both in one
  step. That way the running app keeps working during the transition.

## Dependencies

- Soft-depends on spec 001 (chat handler fix) only because verifying the
  end-to-end flow afterwards requires a working chat path.
