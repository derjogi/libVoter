# Hansard Corpus Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist corpus documents by stable source identity even when they have no candidate or party association, while preserving existing identity-required adapter behavior.

**Architecture:** Extend normalized evidence and `evidence_sources` with generic source-document metadata. Adapters opt out of identity ownership explicitly; the runner otherwise keeps its current unmatched behavior. Documents with stable external IDs update by `(source_adapter, external_id)` before legacy hash or URL deduplication.

**Tech Stack:** TypeScript, Bun, Vitest, Drizzle ORM, SQLite

---

### Task 1: Define corpus behavior through failing runner tests

**Files:**
- Modify: `tests/unit/ingestion.test.ts`
- Modify: `src/lib/server/ingestion/types.ts`
- Modify: `src/lib/server/ingestion/runner.ts`
- Modify: `src/lib/server/ingestion/store.ts`

- [x] Add a fake corpus adapter that sets `requiresIdentity = false` and returns an unowned normalized source with `externalId`, `documentType`, `sourceStatus`, and `parliamentNumber`.
- [x] Add a test proving an unowned corpus document is inserted with all metadata.
- [x] Run `bun run test tests/unit/ingestion.test.ts` and confirm the test fails because corpus identity and metadata are unsupported.
- [x] Add the minimal adapter/type/runner/store fields needed to insert the document.
- [x] Run the focused test and confirm it passes while existing unmatched behavior remains green.

### Task 2: Make stable document identity control updates

**Files:**
- Modify: `tests/unit/ingestion.test.ts`
- Modify: `src/lib/server/ingestion/store.ts`
- Modify: `src/lib/server/ingestion/runner.ts`

- [x] Add a test that ingests draft and final content with the same adapter/external ID and expects one updated row.
- [x] Run the focused test and confirm it fails because only hash/URL identity exists.
- [x] Add `findByExternalId(sourceAdapter, externalId)` to both evidence stores.
- [x] Check stable external identity before legacy hash/URL deduplication and update metadata/content in place.
- [x] Run the focused tests and confirm draft-to-final update and idempotent re-run behavior pass.

### Task 3: Persist the schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0006_*.sql`
- Modify: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Test: `tests/unit/ingestion.test.ts`

- [x] Add nullable generic metadata columns plus a unique index on source adapter and external ID.
- [x] Run `bunx drizzle-kit generate` and inspect the generated migration.
- [x] Run `bunx drizzle-kit migrate` so the committed development database matches the schema.
- [x] Run ingestion and schema tests.

### Task 4: Verify compatibility and document the result

**Files:**
- Modify through LeanSpec CLI: `specs/011-hansard-corpus-model/README.md`

- [x] Run `bun run test tests/unit/ingestion.test.ts tests/unit/db-schema.test.ts`.
- [ ] Run `bun run lint` and the full `bun run test` suite. Attempted; blocked by unrelated existing lint debt and the `ComponentRenderer.tsx` parse error.
- [x] Use LeanSpec CLI to check completed acceptance items, append implementation decisions, and mark spec 011 complete.
- [x] Run `lean-spec validate` and `git diff --check`.
