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
updated_at: 2026-06-22T20:58:19.976647424Z
completed_at: 2026-06-22T20:58:19.976647424Z
transitions:
- status: in-progress
  at: 2026-06-22T20:46:32.335967102Z
- status: complete
  at: 2026-06-22T20:58:19.976647424Z
---

# Resumable browser-acquired Hansard cache

## Overview

Acquire Parliament 54 Hansard metadata and daily transcript resources through a normally verified browser session, then ingest from a durable local cache. This separates fragile live access from deterministic database ETL.

## Design

Add a `fetch:hansard` command backed by the installed `agent-browser` CLI. It opens the public Hansard application, waits for normal browser verification to finish, and makes the same-origin requests used by the Parliament client. It never exports or replays verification cookies.

Search requests use DateOnly values (`YYYY-MM-DD`). The fetcher writes versioned metadata and gzip-compressed daily transcripts under ignored `data/hansard-cache/`. An atomic manifest records the term, request contract, completed pages and dates, failures, and whether the cache is complete. Re-running resumes valid work and can explicitly refresh draft or corrected material.

The `nz-hansard` adapter reads this cache when given `--hansard-cache`. It rejects incomplete or incompatible caches by default, while an explicit sample mode permits limited smoke tests. Normalization, stable IDs, section extraction, and SQLite upsert remain in the existing adapter and runner.

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
