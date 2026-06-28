---
status: complete
created: 2026-06-26
priority: high
tags:
- architecture
- schema
- multi-election
- data
depends_on:
- '002'
created_at: 2026-06-26T09:29:54.931155002Z
updated_at: 2026-06-28T07:27:47.294399668Z
completed_at: 2026-06-28T07:27:47.294399668Z
transitions:
- status: complete
  at: 2026-06-28T07:27:47.294399668Z
---

# Per-election database files and pluggable election wiring

> **Status**: in-progress · **Priority**: high · **Created**: 2026-06-26

## Overview

We want to support many elections over time (Auckland 2025, NZ 2026, and
later e.g. US 2026, Germany 2028). Specs [002](../002-flexible-election-schema/)
and [003](../003-nz-2026-electorate-support/) made the *schema* generic
(`elections → races → candidacies`, every row tagged with `election_id`) but
kept **one shared SQLite file** (`voting-advisor.db`) and **one hard-coded
active election** (`electionConfig` in
[`src/lib/config/election.ts`](../../src/lib/config/election.ts)).

That single-file design is currently leaking data across elections and the
app is half-migrated. This spec proposes moving to **one database file per
election** plus a small **per-election wiring layer**, so each election is a
self-contained, swappable unit.

### Current state (verified 2026-06-28)

- **Election data is physically split.** `src/lib/server/db.ts` resolves the
  active election to `data/elections/<election-id>.db` by default, while still
  allowing `DATABASE_URL` as an explicit override. The split files are:
  - `data/elections/nz-2026.db`: 1 election row, 71 electorates + 1 list race,
    309 real candidacies, 16 parties, 13 `party_policy` evidence sources, and
    **0 legacy Auckland candidates**.
  - `data/elections/auckland-2025.db`: 1 election row, 1 mayor + 57 ward races,
    558 candidacies, and the 558 legacy Auckland candidate rows kept only for
    backward compatibility.
  - `data/reference.db`: 4556 parliament-scoped Hansard evidence sources moved
    out of the election files.
- **The active-election bug is fixed.** The seat flow now uses
  `getCandidatesForSeat(seat)` and reads `races → candidacies → people/parties`
  for the active election instead of calling Auckland-only mayor/ward helpers.
- **Chroma is namespaced per election.** Runtime evidence retrieval uses
  `election-${electionId}`. The `election-nz-2026` collection currently has 479
  chunks, all `nz-2026` `party_policy` chunks.

### What we actually want

1. **Strong isolation per election.** Selecting/ranking candidates for
   election X must never be able to read election Y's rows. The simplest
   guarantee is physical separation.
2. **Each election is a shippable, versioned, rebuildable unit.** Wipe /
   re-scrape / re-embed NZ 2026 without touching Auckland 2025.
3. **Pluggable per-election wiring.** Different elections need different seat
   types, ballot structure (FPP vs STV vs MMP two-vote), scrapers/adapters,
   and prompt language. Adding US 2026 should mean *adding* an election
   module + its data file, not editing shared query code.

## Design

### Decisions (settled)

1. **One DB file per election, same generic schema in every file.** Use the
   spec-002 schema (`elections → races → parties → candidacies`) unchanged in
   each per-election file. **Do not fork tables per country.** Per-election
   differences (seat types, ballot structure, scrapers, prompt language) are
   expressed as **data + config + adapters**, never as divergent tables. The
   per-file split makes future schema divergence *safe* if a country ever
   truly needs it, without forcing it now.
2. **Parliament-scoped reference corpora live in a shared `reference.db`**, not
   duplicated into each election file. The Hansard corpus (specs 011–016) spans
   multiple NZ elections, so it stays read-only and shared (a shared
   `reference` Chroma collection alongside it). Per-election files import/cite
   it by id; they never copy it. Non-shared, election-specific evidence
   (candidate/party sources) stays in the per-election file + collection.

### Decision: one DB file per election, selected by config

```diagram
╭──────────────────────────────────────────────────────────────╮
│ data/elections/                                                │
│   auckland-2025.db   ← elections, races, candidacies, parties, │
│   nz-2026.db            evidence_sources (this election only)  │
│   us-2026.db                                                   │
├──────────────────────────────────────────────────────────────┤
│ data/reference.db (optional, shared)                          │
│   hansard_* corpus (parliament-scoped, spans NZ elections)    │
╰──────────────────────────────────────────────────────────────╯

electionConfig.id ──▶ resolveDbPath(id) ──▶ data/elections/<id>.db
```

- **Same generic schema** (spec 002) applies to every per-election file — we
  are *not* forking the schema per country yet. Per-election differences are
  expressed as **data + config + adapters**, not divergent tables. (If a
  future country genuinely needs different tables, that's a follow-up; the
  per-file split makes such divergence safe rather than forcing it.)
- **DB path derived from `electionConfig.id`**, e.g.
  `file:./data/elections/${electionConfig.id}.db`, overridable via
  `DATABASE_URL`. [`src/lib/server/db.ts`](../../src/lib/server/db.ts) becomes
  a small resolver instead of a hard-coded singleton.
- **Chroma already namespaces by collection** — give each election its own
  collection (e.g. `election-nz-2026`) instead of a shared `evidence`
  collection filtered by `election_id` metadata. Mirrors the SQLite split.
- **Per-election wiring module.** Introduce an `Election` descriptor that
  bundles `ElectionConfig` + its ingestion adapter(s) + ballot/seat behaviour
  (which `races.kind`s are user-facing, one-vote vs two-vote panel). Shared
  query helpers take the resolved `db` + descriptor; nothing reads a global
  Auckland table.
- **Shared reference data (Hansard).** The Hansard corpus (specs 011–016) is
  parliament-scoped and feeds multiple NZ elections. Keep it in a separate
  `reference.db` (or a shared Chroma collection) rather than duplicating it
  into every election file. **Open question** — see Notes.

### Why not keep the single DB + `election_id` filter (spec 002 approach)?

Tradeoffs captured so the decision is on record:

| | Single DB + `election_id` filter | One file per election (this spec) |
|---|---|---|
| Isolation | Relies on every query adding a filter (the current bug shows how that fails) | Physical; impossible to leak |
| Ship / wipe one election | Coupled; risky deletes | Drop/replace one file |
| Schema divergence later | Hard (shared tables) | Easy (per-file) |
| Shared corpus (Hansard) | Natural (one place) | Needs a shared reference DB |
| Migration tooling | One target | Must run per file / loop |
| Connection mgmt | One singleton | Resolver keyed by election id |

The isolation + shippability wins fit a multi-election product and would have
*prevented* the current Auckland-mayors-in-NZ leak.

## Plan

- [x] Add `resolveDbPath(electionId)` + per-election client factory in
      [`src/lib/server/db.ts`](../../src/lib/server/db.ts); keep
      `DATABASE_URL` as an override. Default path
      `data/elections/<id>.db`.
- [x] Make `drizzle.config.ts` / migration commands run against a chosen
      election file (env or loop over `data/elections/*.db`). Verified with a
      fresh temporary SQLite migration run.
- [x] Split the current `voting-advisor.db` into `auckland-2025.db` and
      `nz-2026.db` via a one-off script (filter by `election_id`; move the
      legacy `candidates` rows into `auckland-2025.db`).
- [x] Per-election Chroma collection name (`election-${electionId}`) in
      [`vector-store.ts`](../../src/lib/server/rag/vector-store.ts).
- [x] Route `actions/database.ts` and runtime DB/vector wiring through the active
      election descriptor/config (`electionConfig`) so generic helpers use the
      active election's database and Chroma collection.
- [x] **Fix the active bug as part of this**: replace the unconditional
      `getMayorCandidates()` + `getCandidatesByWard()` in
      [`page.tsx`](../../src/app/page.tsx#L239-L260) with a generic
      `getCandidatesForSeat(seat)` resolving `races → candidacies →
      people/parties` from the active election's DB.
- [x] Move the Hansard corpus into a shared `reference.db` (Decision 2); keep
      election files free of parliament-scoped data. A shared `reference` Chroma
      collection remains a follow-up when spec 014 backfill produces the stable
      utterance-level corpus.

## Test

- [x] With `electionConfig = NZ_2026`, selecting an electorate returns that
      electorate's `nz-2026` candidacies — **never** the Auckland mayors.
- [x] Switching `electionConfig` to `auckland-2025` and back changes the
      backing file with zero cross-election rows visible.
- [x] Migrations apply cleanly to a fresh empty election file.
- [x] RAG retrieval for election X uses X's per-election collection (`evidence-X`).

## Notes

- **Scope boundary.** This spec is about *storage layout + wiring*; the
  separate ranking-reliability issue (the `openrouter/free` model returning
  empty `rankings` / timing out) is independent and tracked elsewhere.
- **Data is still placeholder for NZ 2026** (9 sample candidacies, 0 real
  parties). Wiring to the new model is necessary but not sufficient for a
  real demo — real candidate ingestion (spec 010) is the other half.
- **Resolved — generic schema, no per-country forking.** See Decision 1. The
  per-file split is about isolation/shippability, not schema divergence; every
  election file uses the spec-002 schema until a concrete country requirement
  forces otherwise.
- **Resolved — Hansard / reference data → shared `reference.db`.** See
  Decision 2. Read-only parliament-scoped corpora are shared, not copied per
  election.
- **Open question — switching at runtime.** Per maintainer scoping so far,
  the active election is a code edit. Per-file storage makes a future runtime
  registry/switcher easy but that is out of scope here.
- Supersedes the storage assumption (single shared DB) in spec 002 while
  keeping its generic schema; relates to spec 003 (NZ wiring) and spec 010
  (data ingestion).
