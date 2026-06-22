# Manifest-Authoritative Hansard Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cached Hansard ingestion derive pagination and available history from the cache manifest while treating CLI `--since` and `--limit` only as filters.

**Architecture:** Expose validated cache metadata through the cache transport and let `NzHansardAdapter` use it only in local-cache mode. The adapter will request cached pages in their stored layout, filter records against the effective requested date, and report a warning through the ingestion context when the requested history predates the cache. Acquisition remains strict and incomplete caches remain opt-in.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, LeanSpec.

---

### Task 1: Expose manifest-authoritative cache metadata

**Files:**
- Modify: `src/lib/server/ingestion/hansard/cache.ts`
- Test: `tests/unit/hansard-cache.test.ts`

- [x] Write a failing test proving the cache transport exposes the manifest page size/start date and reads a stored page even when a caller's filtering date is newer.
- [x] Run `bun run test tests/unit/hansard-cache.test.ts` and confirm the new test fails for missing metadata/strict request matching.
- [x] Add a metadata accessor to `HansardCacheTransport`; make stored pagination authoritative and retain validation for Parliament number and unavailable pages.
- [x] Run the focused test and confirm it passes.

### Task 2: Apply ingestion filters over manifest layout

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `src/lib/server/ingestion/types.ts`
- Modify: `src/lib/server/ingestion/runner.ts`
- Test: `tests/unit/hansard-cache-adapter.test.ts`
- Test: `tests/unit/ingestion.test.ts`

- [x] Write failing tests proving cached discovery uses the manifest page size without constructor configuration, accepts a newer `since`, warns and clamps an older `since`, honors `limit`, and still rejects incomplete caches without `--allow-partial-cache`.
- [x] Run the focused tests and confirm failures describe the current exact-contract behavior.
- [x] Add the runner logger to `AdapterContext` so adapters can emit operational warnings through the existing CLI logger.
- [x] In local-cache mode, load manifest metadata, use its page size and start date for page reads, use the requested date only for record filtering, and warn when the requested date is earlier than cached coverage.
- [x] Determine exhaustion from manifest layout rather than the short final response's `pageSize`.
- [x] Run focused tests and confirm they pass.

### Task 3: Documentation and verification

**Files:**
- Modify: `docs/SETUP.md`
- Update through LeanSpec CLI: `specs/016-hansard-offline-cache/README.md`

- [x] Document that acquisition parameters define cache layout while ingestion parameters filter the manifest-authoritative corpus.
- [x] Document the warning behavior for requests earlier than cached coverage and the retained `--allow-partial-cache` requirement.
- [x] Run `bun run test`, `bunx tsc --noEmit`, scoped `bunx biome check`, `git diff --check`, and `lean-spec validate`.
- [x] Record verification results in spec 016 and mark it complete.
