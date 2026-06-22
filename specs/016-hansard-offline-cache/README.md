---
status: complete
created: 2026-06-22
priority: high
tags:
- hansard
- cache
- browser
- ingestion
depends_on:
- '012'
parent: '010'
created_at: 2026-06-22T20:39:58.986637096Z
updated_at: 2026-06-23T04:56:33.113376963Z
completed_at: 2026-06-22T20:58:19.976647424Z
transitions:
- status: in-progress
  at: 2026-06-22T20:46:32.335967102Z
- status: complete
  at: 2026-06-22T20:58:19.976647424Z
- status: in-progress
  at: 2026-06-22T22:04:52.609050890Z
- status: complete
  at: 2026-06-22T22:07:25.610086827Z
- status: in-progress
  at: 2026-06-23T03:55:04.859547255Z
- status: complete
  at: 2026-06-23T03:56:25.697489103Z
- status: in-progress
  at: 2026-06-23T04:52:25.170962858Z
- status: complete
  at: 2026-06-23T04:56:33.113376963Z
---

# Resumable browser-acquired Hansard cache

## Overview

Acquire Parliament 54 Hansard metadata and daily transcript resources through a normally verified browser session, then ingest from a durable local cache. This separates fragile live access from deterministic database ETL.

## Design

Add a `fetch:hansard` command backed by the installed `agent-browser` CLI. It opens the public Hansard application, waits for normal browser verification to finish, and makes the same-origin requests used by the Parliament client. It never exports or replays verification cookies.

Search requests use DateOnly values (`YYYY-MM-DD`). The fetcher writes versioned metadata and gzip-compressed daily transcripts under ignored `data/hansard-cache/`. An atomic manifest records the term, request contract, completed pages and dates, failures, and whether the cache is complete. Re-running resumes valid work and can explicitly refresh draft or corrected material.

The `nz-hansard` adapter reads this cache when given `--hansard-cache`. It rejects incomplete or incompatible caches by default, while an explicit sample mode permits limited smoke tests. Normalization, stable IDs, section extraction, and SQLite upsert remain in the existing adapter and runner.


### Manifest-authoritative ingestion\n\nCache-backed ingestion treats the manifest as authoritative for storage layout and available coverage. The cache transport reads pages using the acquisition page size recorded in the manifest; ingestion CLI parameters never redefine cached pagination. `--limit` and `--since` are filters over the cached corpus. A `--since` newer than the manifest start filters out older records. A `--since` older than the manifest start emits a warning and ingests from the earliest cached date rather than failing. Incomplete caches continue to require the explicit `--allow-partial-cache` flag. Acquisition resume remains strict because changing its start date or page capacity changes the cache layout.

## Plan

- [x] Add cache schemas, validation, atomic writes, gzip helpers, and fixtures.
- [x] Add an agent-browser client that waits for verified Hansard and performs same-origin JSON requests.
- [x] Add resumable Parliament 54 metadata and transcript acquisition with conservative pacing.
- [x] Add cache-backed Hansard discovery and transcript loading.
- [x] Add `fetch:hansard` and `--hansard-cache` CLI operations.
- [x] Document sample, full acquisition, resume, refresh, and offline ingestion.
- [x] Link operational backfill spec 014 to this prerequisite.

## Test

- [x] Automated tests make no live Parliament requests.
- [x] Search dates use the current DateOnly contract.
- [x] Interrupted acquisition resumes without re-fetching valid files.
- [x] Atomic writes do not expose partial metadata or transcripts.
- [x] Missing, corrupt, incompatible, and incomplete caches fail clearly.
- [x] Gzip transcript fixtures ingest to the same normalized records as live fixtures.
- [x] A one-page and one-date browser smoke run succeeds before full backfill.

## Notes

Diagnosis on 2026-06-23 confirmed that direct Bun and curl requests receive Radware HTML. A normal browser session reaches the real application after verification, and same-origin search and transcript requests return JSON. The search endpoint currently accepts `dateFrom: "2023-12-05"` but rejects the previous ISO timestamp. The term currently reports roughly 36,775 eligible sections, so acquisition must be resumable and transcripts must be cached once per sitting date.

Implemented and verified on 2026-06-23. The bounded live smoke run acquired search page 1 of 368 and the 2026-05-28 transcript with zero failures. The cache reported 36,775 eligible sections and occupied 612 KB: 74,274 bytes of metadata and a 530,587-byte gzip transcript. Offline dry-run ingestion discovered five refs, normalized four records, skipped one empty section, and made no live Parliament requests. Re-running acquisition reused the cached page and transcript. Final verification: 118 tests passed with one intentional skip, TypeScript passed, scoped Biome passed, Drizzle passed, LeanSpec validation passed, and scoped diff whitespace checks passed.

Hardening on 2026-06-23: acquisition now retries transient browser search/transcript failures up to three times, preserves structured agent-browser stdout diagnostics, and rejects unknown CLI options with guidance to use --limit-pages and --limit-dates for bounded samples. Added regression coverage for transient retries, persistent failures, browser stdout errors, and unsupported flags.

Pagination hardening on 2026-06-23: Parliament search responses report the number of returned records as pageSize, so a short final page must not be used as the configured page capacity. Acquisition now calculates the terminal page from the requested capacity and clears stale search failures beyond that terminal page (for example page 48 after a 47-page corpus). Added a regression reproducing a short final page and stale next-page failure.

Manifest-authoritative ingestion implemented on 2026-06-23. Cache mode now reads stored pagination and coverage from the validated manifest; ingestion `--since` and `--limit` only filter cached records. Requests older than cached coverage emit a warning and ingest the available overlap. Incomplete caches still require `--allow-partial-cache`, and acquisition resume remains strict. Verification: 126 tests passed with one intentional skip, TypeScript passed, scoped Biome passed, and diff whitespace checks passed.
