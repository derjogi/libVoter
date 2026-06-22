---
status: planned
created: 2026-06-22
priority: medium
tags:
- hansard
- etl
- validation
- operations
depends_on:
- '012'
- '013'
parent: '010'
created_at: 2026-06-22T05:43:26.849375647Z
updated_at: 2026-06-22T05:43:26.849486333Z
---
# Backfill and validate the 54th Parliament Hansard corpus

## Overview

Run the completed Hansard pipeline across the whole 54th Parliament and establish that the result is complete enough, repeatable, and practical to ship with lib-voter.

## Design

Use the term boundary—Parliament 54 from December 2023 onward—instead of a moving three-year window. Run as an offline batch job with conservative rate limits, resumable updates, and no per-request scraping.

Before committing a populated database, measure document count, text size, database growth, runtime, errors, and unresolved participants. If the corpus makes the committed SQLite file impractical, document and implement an explicit build artifact or bootstrap strategy rather than silently bloating the repository.

## Plan

- [ ] Run a limited live sample covering every supported document type.
- [ ] Validate source IDs, dates, statuses, content, participants, and party votes manually against official pages.
- [ ] Run the complete Parliament 54 backfill with progress and error reporting.
- [ ] Re-run to prove document and relationship idempotency.
- [ ] Measure corpus and repository size impact and choose the shipping strategy.
- [ ] Record counts, gaps, operational commands, and refresh guidance.

## Test

- [ ] The sample contains speeches, questions, votes, and other substantive events.
- [ ] No combined Daily transcript duplicates individual evidence.
- [ ] A second run creates no duplicate documents or relationships.
- [ ] Draft-to-final changes update existing rows.
- [ ] Failures are reported with enough identity to retry.
- [ ] The selected storage and distribution strategy is documented and reproducible.

## Notes

This is intentionally separate from adapter implementation because live access, volume, and data quality are operational risks of their own.