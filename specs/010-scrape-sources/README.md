---
status: in-progress
created: 2026-06-19
priority: medium
tags:
- scraping
- ingestion
- data
- etl
parent: 009-candidate-evidence-rag
created_at: 2026-06-19T02:02:10.226282330Z
updated_at: 2026-06-19T21:05:53.933683701Z
transitions:
- status: in-progress
  at: 2026-06-19T21:05:53.933683701Z
---
# Scrape candidate & party evidence sources (NZ 2026)

> **Status**: planned · **Priority**: medium · **Created**: 2026-06-19

## Overview

This is **spec 009 Phase 3 (ingestion), extracted** because it is large
enough to stand alone. Goal: populate the `evidenceSources` table (added
in [spec 009 Phase 2](../009-candidate-evidence-rag/README.md)) with
per-candidate / per-party source documents — voting records, parliamentary
speeches, disclosures, manifestos, profiles — so the evidence-retrieval
RAG (009 Phase 4) has real data to chunk, embed, retrieve, and cite.

Scope is **NZ 2026** first (the active widening target). The existing
[`scripts/scrape-candidates.ts`](../../scripts/scrape-candidates.ts)
(Auckland 2025) is the template/first adapter to generalize from.

Constraints from the maintainer's intent:

- **Offline / batch** ingestion during DB build, plus a **background
  refresher** — never per-request scraping.
- Store **full text** + `url` + `publishedAt` + `sourceType` per source so
  we can re-embed and show/expand/link the original (009's design).
- Respect robots.txt, ToS, and rate limits; prefer official/open data;
  treat party/candidate sites as self-promotional and verify against the
  official record.

## Sources (NZ)

For NZ candidates the strongest foundation is official Electoral
Commission + Parliament/Hansard data, then layer media, speeches, and
financial disclosures for context. There is **no single official
candidate/votes API**; the public record is fragmented, so a scraper/ETL
pipeline is the practical answer.

| Source | Gives you | Access | `sourceType` |
|---|---|---|---|
| Electoral Commission (elections.nz) | Candidate/party lists, rules, donations & loan disclosures, election open data | Web pages; some open data; scraping for older pages | `voting_record`-adjacent / disclosure → `statement`/`manifesto` |
| Parliament / Hansard | Speeches, debate contributions, votes where available | Mostly web; no clean official votes API | `hansard`, `voting_record` |
| data.govt.nz | Discovery layer: metadata + some dataset APIs | API/JSON for metadata | (discovery only) |
| Register of MPs' interests | Pecuniary interests, gifts, property, liabilities | Often PDF/web | `statement` (disclosure) |
| Party & candidate websites | Policy statements, biography | Web | `manifesto`, `party_policy` |
| Aggregators (voted.nz, The Progress Report) | Voting/membership data, politician discovery | Web; voted.nz mirrors parliamentary records | discovery → verify to primary |

**Per-candidate dossier fields:** prior voting record, speeches, written
questions, committee activity, donations, declared interests, party
affiliation changes, prior candidacies. These rarely live in one place —
combine Parliament records with Electoral Commission disclosures.

## Design

### Adapter + pipeline (ETL)

```
SourceAdapter.discover()  ─▶ list of source refs (urls / ids)
              .fetch()    ─▶ raw payload (rate-limited, robots-aware)
              .normalize()─▶ NewEvidenceSource[] (clean text + metadata)
                              │
                runner: dedup (contentHash) ─▶ upsert evidenceSources
                              │
              (009 Phase 4) chunk + embed ─▶ vector store
```

- **`SourceAdapter` interface** — one implementation per source. Each
  yields normalized `NewEvidenceSource` rows (`candidateId`/`partyId`,
  `sourceType`, `url`, `title`, `author`, `publishedAt`, `content`,
  `contentHash`). Keeps source-specific HTML/PDF parsing isolated and
  individually testable.
- **Runner / CLI** — selects adapters, applies global rate limiting +
  robots checks, dedups by `contentHash`, upserts into `evidenceSources`.
  Flags: `--source`, `--election`, `--limit`, `--since`, `--dry-run`.
- **Identity resolution** — map scraped people/parties to ids. During the
  spec-002 migration, link to the legacy `candidates` / `electionParties`
  ids (match by name + electorate); **report unmatched** rather than
  silently dropping.
- **Refresher** — start as a manually-run `bun run` script; a server-side
  scheduler (cron/queue) comes later. Change detection via `contentHash`
  + `fetchedAt`; unchanged sources are skipped, not duplicated.
- **Reuse** — refactor the Auckland scraper into the first adapter so the
  runner/identity/dedup plumbing is proven on known data before adding NZ
  sources.

### Compliance

robots.txt + ToS aware, conservative rate limits, headed Chromium only
where a source requires it (as the Auckland scraper does). Prefer official
/ open data; aggregators are for discovery, then verify back to primary.

## Plan

> Adapters are the bulk of the work — each can be promoted to its own
> child spec when picked up if it proves large.

- [x] **Pipeline framework**: `SourceAdapter` interface + runner that
      writes to `evidenceSources` (dedup via `contentHash`), with the CLI
      flags above and shared rate-limit / robots guards. Done in
      [`src/lib/server/ingestion/`](../../src/lib/server/ingestion/):
      `types.ts` (adapter interface), `runner.ts` (discover→fetch→normalize→
      resolve→dedup→upsert, idempotent by `contentHash`, same-URL change =
      update, errors collected not thrown), `store.ts` (`EvidenceStore` port
      with `InMemory` + `Drizzle` impls so the runner is unit-testable
      DB-free), `robots.ts` (longest-match `parseRobotsTxt`/`isAllowed` +
      caching `RobotsGuard`), `rate-limit.ts` (per-host `RateLimiter` with
      injectable clock), `text.ts` (`htmlToText`), `hash.ts` (sha256). CLI:
      [`scripts/ingest-sources.ts`](../../scripts/ingest-sources.ts) with
      `--source/--election/--limit/--since/--dry-run` (`bun run ingest:sources`).
- [x] **Identity resolution**: map scraped records → candidate / party
      ids (name + electorate matching); surface an "unmatched" report.
      Done: [`identity.ts`](../../src/lib/server/ingestion/identity.ts)
      (`normalizeName` handles `LAST, First` vs `First Last` + accents;
      district disambiguation for same-named candidates) +
      [`identity-index.ts`](../../src/lib/server/ingestion/identity-index.ts)
      (builds the index from legacy `candidates` for auckland-2025, else
      `candidacies`→`people`→`races`; parties from `electionParties`).
      `RunResult.unmatched` lists dropped records; CLI prints them.
- [x] **Refactor Auckland scraper** into the first `SourceAdapter` using
      the new runner. Done:
      [`adapters/auckland.ts`](../../src/lib/server/ingestion/adapters/auckland.ts)
      reads the committed `data/all-candidates.json` (offline/deterministic;
      live re-scrape stays in `scripts/scrape-candidates.ts`). Verified
      against the real DB: 558-candidate index, sources resolved with 0
      unmatched, real insert then idempotent re-run (skipped, no dups).
- [~] **Adapters (NZ 2026)** — each may become a child spec:
  - [x] **Party platform (Wikipedia)** —
        [`adapters/wikipedia-party.ts`](../../src/lib/server/ingestion/adapters/wikipedia-party.ts).
        Real 2026 candidate lists aren't published yet, so the first NZ
        adapter ingests every registered party contesting the election via the
        official MediaWiki API (clean plain-text extracts, robots-aware,
        rate-limited) as `party_policy` evidence linked by `partyId`. Covers
        **all 13 parties** from the 2026 election's "Parties and candidates"
        list — defined once in
        [`src/lib/config/nz-parties.ts`](../../src/lib/config/nz-parties.ts)
        and shared with the seeding script
        ([`scripts/scrape-nz-2026.ts`](../../scripts/scrape-nz-2026.ts) seeds
        the matching `election_parties` rows). Live run populated 13 rows for
        nz-2026 (0 unmatched, idempotent re-run). The active `electionConfig`
        is now `NZ_2026`. CC BY-SA text keeps `url` for attribution +
        link-out. Source `nz-party-policy`.
  - [x] **Wikipedia candidate roster (NZ 2026)** —
        [`scripts/scrape-nz-candidates.ts`](../../scripts/scrape-nz-candidates.ts)
        (`bun run scrape:nz-candidates`). Until elections.nz publishes official
        lists, this parses the MediaWiki wikitext of "Candidates in the 2026 NZ
        general election by electorate" and populates the **structured roster**
        (`races`→`people`→`candidacies`, linked to `election_parties`), not
        `evidence_sources`. Real run: 309 candidacies across 71 electorates,
        party names mapped to the canonical 13 + 3 off-config parties created
        (Alliance, Build the Nation, Te Tai Tokerau Party), 4 independents.
        Idempotent (stable ids + upserts); removes the old "Sample X Candidate"
        placeholders and empty/renamed electorate races; `--prune` drops
        candidacies no longer listed, `--dry-run` reports without writing.
  - [ ] Electoral Commission: candidate/party lists + donations/loans
        (authoritative replacement for the Wikipedia roster once published).
  - [x] Parliament / Hansard: speeches & debate contributions (+ votes
        where available). Corpus discovery/storage, participant and party
        relationships, utterance segmentation, deterministic mention rows, and
        utterance-aware vector metadata are complete via specs 011-015.
  - [ ] Register of MPs' interests: PDF/web → text.
  - [ ] Party & candidate websites: policy + bios (verify vs official).
  - [ ] Aggregators (voted.nz, The Progress Report): discovery → verify.
- [ ] **Refresher**: scheduled re-run, `contentHash` change detection,
      `fetchedAt` bookkeeping.
- [x] **Hand off to 009 Phase 4**: chunk + embed `evidenceSources` into
      the vector store with the metadata filter. The embedding script's
      `--repopulate` path resets only the derived `evidence` collection before
      rebuilding, so repeated runs cannot append duplicate random-ID chunks.


- [ ] **Spec 026:** build and atomically publish the Auckland Central candidate-personal evidence slice using this ingestion framework and Spec 024 publication.
- [ ] **Spec 031:** expand the proven evidence workflow electorate by electorate after the vertical slice is reviewed.

## Test

Unit tests in [`tests/unit/ingestion.test.ts`](../../tests/unit/ingestion.test.ts)
(12 tests, run under `bun run test`):

- [x] Running one adapter populates `evidenceSources` with rows linked to
      a candidate/party, with `url`, `sourceType` set. Covered by the
      runner test + verified end-to-end against the real DB via
      `bun run ingest:sources --source auckland`.
- [x] Re-running is idempotent: `contentHash` dedup means unchanged
      sources are not duplicated (unit + real-DB verified).
- [x] Unmatched scraped records are reported, not silently dropped.
- [x] Golden/fixture test for HTML→text cleaning (Auckland adapter +
      `htmlToText`; fixture `tests/unit/fixtures/auckland-sample.json`).
- [x] robots.txt + rate-limit guards are unit-tested.

PDF→text cleaning is deferred until a PDF-based NZ adapter (register of
interests) is built.

## Notes

- **Biggest gap:** no clean, official, stable API linking NZ candidate
  votes + speeches. Hansard is the canonical behavioral record; third-party
  mirrors (voted.nz) are useful for discovery but must be verified to
  primary sources.
- **Suggested research stack:** Electoral Commission for the election layer
  (identity, standing, donations) → Hansard for behavior (speeches, votes)
  → register of interests for assets/conflicts → media + candidate sites
  for issue positions, cross-checked against the official record. Store
  everything keyed by candidate id, electorate, party, and date.
- Open question: how aggressively to normalize `sourceType` for disclosure
  data (donations, interests) — may warrant a dedicated type later.

### References

- Electoral Commission: <https://elections.nz/media-and-news/media-resources>,
  <https://elections.nz/guidance-and-rules/donations-and-loans>,
  <https://elections.nz/stats-and-research/party-donations-and-loans>
- Parliament votes / Hansard discovery: <https://voted.nz/about/>,
  <https://data.govt.nz/datasetrequest/show/849>,
  <https://www.data.govt.nz/search/SearchForm?Search=API>
- Register of MPs' interests: <https://www.beehive.govt.nz/release/register-mps-interests-be-introduced>,
  <https://publicdata.co.nz>
- Aggregator: <https://theprogressreport.co.nz/politician-list/>


### Hansard corpus decomposition (22 June 2026)

Hansard is now tracked as a corpus-first workstream rather than a single candidate-owned adapter checkbox:

- Spec 011: corpus storage and identity-free evidence.
- Spec 012: official Parliament 54 document discovery and normalization.
- Spec 013: typed person and party relationships.
- Spec 014: full-term backfill, validation, and distribution decision.
- Spec 015: deferred utterance segmentation and mention enrichment.

This ordering preserves the official record before candidacies are known and keeps mentions distinct from actual participation.

## Dependencies

- **Part of**: spec 009 (this is its extracted Phase 3); populates the
  `evidenceSources` table from 009 Phase 2 and feeds 009 Phase 4.