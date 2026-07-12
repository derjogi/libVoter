# Election Data Adapter Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove generic `ward` terminology from the active application while preserving compatibility with existing election SQLite databases through a storage adapter boundary.

**Architecture:** Define an application-owned `Candidate` model with a generic `seat` field. Move election queries and legacy-row translation into a server-only repository that first uses the generic election schema and falls back to the legacy Auckland table only inside that boundary. Server Actions delegate to the repository; UI, AI, and client helpers consume only application types and use election-configured labels for election-specific language.

**Tech Stack:** TypeScript, Next.js Server Actions, Drizzle ORM/libSQL, Vitest, React 19, LeanSpec, Jujutsu.

---

### Task 1: Introduce the generic candidate application model

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/types/components.zod.ts` only if candidate schemas are still exported there
- Modify: candidate consumers under `src/app/page.tsx`, `src/lib/actions/chat.ts`, `src/lib/client/hooks/useChat.ts`, `src/lib/client/candidate-match.ts`, and `src/lib/server/ai/chat-handler.ts`
- Test: `tests/unit/chat-handler.test.ts`
- Test: `tests/unit/party-matching.test.ts`
- Test: `tests/unit/live-chat-turn.test.ts`
- Test: `tests/unit/live-chat-latency.test.ts`

- [ ] Add a failing type/test fixture using `seat` and no `ward` field.
- [ ] Run the focused test/typecheck and verify it fails because consumers require the Drizzle `Candidate` row.
- [ ] Define the minimal serializable application `Candidate` interface and matching Zod schema in `src/types/index.ts`, preserving currently consumed profile fields but naming the location field `seat`. Use a stable string ID: legacy rows use their decimal ID string; generic rows use `legacyCandidateId` when present and otherwise the candidacy ID.
- [ ] Replace application imports from `@/lib/db/schema` with `@/types` and replace `candidate.ward` with `candidate.seat`.
- [ ] Remove the unused available-seat derivation from `AIChatHandler.processMessage` and simplify `buildSystemPreamble`, because the preamble does not interpolate it.
- [ ] Add a boundary test/architecture assertion that client and application modules do not import `Candidate` from `@/lib/db/schema`.
- [ ] Run focused chat, party, and candidate helper tests plus `bunx tsc --noEmit`.
- [ ] Commit with `jj describe`, then start a new working-copy commit.

### Task 2: Put database translation behind an election repository

**Files:**
- Create: `src/lib/server/election-data.ts`
- Modify: `src/lib/actions/database.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/prompts/prompt-manager.ts`
- Modify: `src/app/test-db/page.tsx`
- Test: `tests/unit/election-data.test.ts`
- Test: `tests/unit/db-schema.test.ts`
- Test: `tests/unit/per-election-storage.test.ts`

- [ ] Write failing repository tests using temporary SQLite files for: generic mapping; legacy-only mapping; generic schema with zero matching rows and populated legacy rows (must remain empty); generic-only without `candidates`; partial generic schema; and unsupported schema. Cover both seat listing and candidate lookup, including IDs with and without `legacyCandidateId`.
- [ ] Run the focused tests and verify the new repository API is missing.
- [ ] Change DB construction to expose an injectable connection bundle containing both typed Drizzle and raw libSQL clients while preserving URL, election-ID, auth-token, and reference-DB behavior.
- [ ] Implement an `ElectionDataRepository` contract with `listSeats()`, `getCandidatesForSeat(seat)`, and `listParties()`.
- [ ] Select the adapter through explicit cached schema-capability inspection (`sqlite_schema`/`PRAGMA table_info`): require the complete generic table/column set, otherwise accept `candidates.ward` as legacy-only, and reject partial/unsupported schemas clearly. Never infer schema type from an empty query result.
- [ ] Implement generic and legacy row translation entirely inside the repository. Use the active connection/config by default and injectable connection/config inputs in tests.
- [ ] Make `getSeatsForCurrentElection()` and `getCandidatesForSeat()` delegate to the repository.
- [ ] Move party retrieval behind the repository. Make `PromptManager` import the server repository rather than a Server Action.
- [ ] Remove `getUniqueWards()`, `getCandidatesByWard()`, `getMayorCandidates()`, and direct legacy fallbacks from active Server Actions. Remove or adapt `loadCandidates`, `searchCandidates`, `getCandidatesByIds`, and the test DB page so no action returns legacy rows. Keep the physical `candidates.ward` schema mapping and persisted `races.kind = "ward"` value unchanged.
- [ ] Update schema exports so the Drizzle row is explicitly named `LegacyCandidateRow`, not the application `Candidate`.
- [ ] Run repository, DB-schema, storage, and full unit tests.
- [ ] Commit with `jj describe`, then start a new working-copy commit.

### Task 3: Rename onboarding/session terminology to seat

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/lib/client/preference-summary-refresh.ts`
- Modify: `src/components/layout/RightPanel.tsx`
- Modify: `src/lib/server/ai/chat-handler.ts`
- Test: `tests/unit/preference-summary-refresh.test.ts`
- Test: `tests/unit/right-panel-summary.test.ts`
- Test: `tests/e2e/chat-flow.spec.ts`

- [ ] Change test fixtures from `ward_selection` to `seat_selection` and verify focused tests fail.
- [ ] Rename active page variables, comments, question IDs, and setup-response filtering to generic seat terminology.
- [ ] Remove generic “ward” examples and comments from shared AI prompt text; use “seat” or an election-configured label.
- [ ] Preserve election-specific visible labels through `electionConfig.seatLabel` and `seatLabelPlural`; Auckland may still display “ward” and NZ may display “electorate.”
- [ ] Add configuration-level UI-copy tests proving both exported Auckland and NZ descriptors generate the correct visible onboarding copy without mutating the module-level active election.
- [ ] Update E2E selectors/assertions to derive or expect the active election's configured label instead of generic backend terminology.
- [ ] Run focused unit tests and the mock E2E flow if its prerequisites are available.
- [ ] Commit with `jj describe`, then start a new working-copy commit.

### Task 4: Remove stale terminology and document the boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SETUP.md`
- Modify: `docs/USER_FLOW.md`
- Modify: `docs/TESTING.md`
- Modify: `src/lib/server/ingestion/types.ts`
- Modify: `src/lib/server/ingestion/identity.ts`
- Modify: `src/lib/server/ingestion/identity-index.ts`
- Modify: `src/lib/server/ingestion/adapters/auckland.ts`
- Modify: `specs/022-election-data-adapter-boundary/README.md` using `lean-spec update`

- [ ] Inventory remaining `ward` occurrences in active source and current docs.
- [ ] Rename generic comments/locals to seat or district while preserving Auckland adapter input fields, legacy schema column names, configured UI copy, literal place names such as “Albany Ward,” and `races.kind = "ward"` domain values.
- [ ] Update current architecture/setup/user-flow/testing docs to describe seat APIs and the adapter boundary; do not rewrite completed historical specs.
- [ ] Run `rg` assertions showing `ward` remains only in permitted database, adapter, election-config, fixture, and election-domain contexts.
- [ ] Run `bun run test`, `bunx tsc --noEmit`, `bun run lint`, and `lean-spec validate 022`.
- [ ] Record implementation decisions and verification in spec 022, mark it complete with `lean-spec update`, commit with `jj describe`, and start a clean working-copy commit.
