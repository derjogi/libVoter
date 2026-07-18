---
status: planned
created: 2026-07-18
priority: high
tags:
- evidence
- ingestion
- nz-2026
parent: 010-scrape-sources
created_at: 2026-07-18T23:54:27.588857896Z
updated_at: 2026-07-18T23:54:27.589189272Z
---
# Build Auckland Central candidate evidence slice

> **Status**: planned · **Priority**: high

## Goal

Create the first real, reproducible candidate-personal evidence corpus for one electorate and publish it through Spec 024's normalized revision model. This is the data fixture for the complete 024 → 025 vertical slice, not a throwaway mock.

## Scope

Auckland Central currently contains these five candidacies:

- Antonia Modkova — ACT
- Candace Kinser — National
- Chlöe Swarbrick — Green
- Johan Chang — The Opportunity Party
- Naisi Chen — Labour

Collect position-bearing candidate material such as campaign policy pages, candidate statements, interviews, questionnaires, and attributable public statements. Keep official-party policy separate. Do not invent text, infer a position from biography alone, or silently attach party policy as personal evidence.

## Architecture

Use the Spec 010 ingestion runner for source discovery, identity resolution, hashing, and durable `evidence_sources`. Add a reproducible committed source manifest for this electorate and a candidate-source adapter rather than one-off SQL. Convert complete sources into revision-scoped Spec 024 passages, then publish one accepted `nz-2026:auckland-central` corpus revision with `publishCorpusRevisionTransaction()`.

## Plan

- [ ] Create `data/evidence/nz-2026/auckland-central-sources.json` with canonical URL, candidate name, electorate, title, source type, and retrieval metadata for every source.
- [ ] Add a schema for that manifest and a failing fixture-validation test. Reject unknown candidates, duplicate URLs, blank titles, and unsupported source types.
- [ ] Implement `src/lib/server/ingestion/adapters/nz-candidate-sites.ts` using the shared `SourceAdapter` contract; register it as `nz-candidate-sites` in `src/lib/server/ingestion/adapters/index.ts`.
- [ ] Add deterministic HTML-to-text fixtures under `tests/unit/fixtures/` and test identity resolution for all five candidacies without live network access.
- [ ] Run `bun run ingest:sources --source nz-candidate-sites --election nz-2026 --dry-run`; require zero unmatched Auckland Central records.
- [ ] Run the real ingestion and verify idempotency: the second run inserts/updates nothing when source content is unchanged.
- [ ] Add `src/lib/server/evidence/source-passages.ts` and `scripts/publish-evidence-corpus.ts` to turn complete source text into explicit candidacy/person/party passages and atomically publish through Spec 024.
- [ ] Publish the Auckland Central corpus; verify one accepted revision, explicit citation spans, source-lineage keys, and at least one personal passage for every candidacy.
- [ ] Commit with `jj` after the manifest/adapter unit and again after the publication unit.

## Test and verification

- `bun run test tests/unit/ingestion.test.ts tests/unit/evidence-corpus.test.ts tests/unit/evidence-corpus-publication-db.test.ts`
- `bunx tsc --noEmit`
- `bun run lint`
- Query SQLite to prove all five candidacies have accepted personal passages and party passages remain `official_party` records.
- Change one fixture source, publish revision 2, and prove revision 1 is superseded and its passage IDs are not reused.

## Done when

All five Auckland Central candidates have cited, accepted personal evidence; the corpus is reproducible from committed source definitions; dry-run and repeat ingestion are clean; and exactly one accepted corpus revision is visible to readers.

## Non-goals

- Complete nationwide evidence coverage.
- Treating party policy as a candidate's personal position.
- Live per-request scraping.
- Building a second corpus path outside Specs 010 and 024.
