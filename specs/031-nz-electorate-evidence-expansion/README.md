---
status: planned
created: 2026-07-18
priority: medium
tags:
- evidence
- ingestion
- nz-2026
depends_on:
- 030-alignment-human-review-calibration
parent: 010-scrape-sources
created_at: 2026-07-18T23:54:27.728341475Z
updated_at: 2026-07-18T23:54:27.728407942Z
---
# Expand candidate evidence across NZ electorates

> **Status**: planned · **Priority**: medium

## Goal

Scale the proven Auckland Central source-manifest, ingestion, publication, and completeness-report workflow across NZ 2026 electorates without changing the ranking architecture.

## Architecture

Reuse the Spec 026 adapter and Spec 024 corpus publication path. Add source manifests in reviewable electorate-sized batches, publish immutable revisions, and track each candidacy as covered or explicitly lacking a discoverable position-bearing source. Never fabricate coverage or substitute party policy for personal evidence.

## Plan

- [ ] Add `scripts/report-candidate-evidence-coverage.ts` to report personal passage count, independent source count, recency, and explicit no-source status per candidacy/electorate.
- [ ] Rank the next electorate batches by zero/low coverage and choose small reviewable groups rather than one nationwide edit.
- [ ] Add committed source-manifest entries for each batch and verify identities with `--dry-run` before ingestion.
- [ ] Ingest, publish a new accepted corpus revision, and verify source/passages/citations for each batch.
- [ ] Record unavailable or unverified candidates explicitly; do not infer their personal position from party membership.
- [ ] Re-run the canonical deterministic integration fixtures against each new corpus revision and fix general adapter/publication bugs rather than adding electorate-specific scoring branches.
- [ ] Keep source refresh manual and content-hash-driven until a real operational need justifies scheduling.
- [ ] Use one `jj` commit per electorate-sized evidence batch, including manifest, database revision, tests, and coverage report changes.

## Test and verification

- Manifest schema and identity tests pass for every batch.
- Repeat ingestion is idempotent and leaves zero silent unmatched records.
- Exactly one accepted revision exists per corpus key.
- Coverage report totals reconcile with the accepted passage rows.
- Full test, typecheck, lint, and build pass after every batch.

## Done when

Every active NZ 2026 candidacy has either at least one verified personal evidence source or an explicit reviewed no-source status, official-party evidence remains separate, and all accepted passages are reproducible and cited.

## Non-goals

- Blocking useful local ranking until nationwide coverage is perfect.
- Per-request scraping or automatic web crawling.
- Adding fallback scores for candidates with missing personal evidence.
