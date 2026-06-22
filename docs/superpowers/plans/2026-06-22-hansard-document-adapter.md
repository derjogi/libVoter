# Hansard Document Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover and normalize Parliament 54 speeches, questions, and votes from the official NZ Parliament Hansard API without storing duplicate Daily transcripts.

**Architecture:** A dedicated `NzHansardAdapter` calls the first-party JSON search endpoint and date-based transcript resource through injectable functions. Discovery emits individual `DebateItem` refs; fetch caches daily HTML by sitting date and extracts the section matching the official GUID; normalization emits corpus-capable evidence metadata from spec 011.

**Tech Stack:** TypeScript, Bun, Vitest, official Parliament JSON/HTML endpoints

---

### Task 1: Register the adapter and implement discovery

**Files:**
- Create: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `src/lib/server/ingestion/adapters/index.ts`
- Create: `tests/unit/hansard-adapter.test.ts`
- Create: `tests/unit/fixtures/hansard-search-sample.json`

- [x] Write a failing registry test for source `nz-hansard`.
- [x] Run the test and verify the unknown-source failure.
- [x] Add the minimal adapter skeleton and registry entry.
- [x] Write a failing discovery test covering Parliament 54, supported subtypes, Daily exclusion, `since`, pagination, and `limit`.
- [x] Implement the official `/api/data/search` request contract and local defensive filtering.
- [x] Verify discovery tests pass without live network calls.

### Task 2: Extract individual sections from daily transcript HTML

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `tests/unit/hansard-adapter.test.ts`
- Create: `tests/unit/fixtures/hansard-transcript-sample.html`

- [x] Write a failing fixture test for GUID-normalized section extraction.
- [x] Implement anchor-based extraction from one `data-id` to the next section anchor.
- [x] Write a failing fetch test proving robots/rate-limit use, daily-date caching, and missing-section skips.
- [x] Implement injectable transcript fetch plus per-date promise caching.
- [x] Verify fetch tests pass without live network calls.

### Task 3: Normalize speeches, questions, votes, and metadata

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `tests/unit/hansard-adapter.test.ts`

- [x] Write failing normalization cases for Speech, Question, and Vote.
- [x] Map Vote to `voting_record`; map Speech and Question to `hansard`.
- [x] Persist official ID, canonical section URL, sitting date, progress, subtype, Parliament number, author, and clean text.
- [x] Verify empty or malformed sections are skipped or reported safely.

### Task 4: Verify and document operations

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify through LeanSpec CLI: `specs/012-hansard-document-adapter/README.md`
- Modify: `docs/SETUP.md`

- [x] Document the first-party endpoint contract, attribution, `--source nz-hansard`, and browser-verification limitation.
- [x] Run focused tests, typecheck, scoped Biome, Drizzle/LeanSpec validation, and diff checks.
- [x] Attempt a small live dry-run; record WAF behavior without bypassing it.
- [x] Check acceptance criteria and mark spec 012 complete if scoped verification passes.
