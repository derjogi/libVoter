---
status: complete
created: 2026-07-12
priority: high
tags:
- architecture
- data
- multi-election
created_at: 2026-07-12T00:52:40.790100729Z
updated_at: 2026-07-12T01:31:10.843018131Z
completed_at: 2026-07-12T01:31:10.843018131Z
transitions:
- status: in-progress
  at: 2026-07-12T01:19:03.458820618Z
- status: complete
  at: 2026-07-12T01:31:10.843018131Z
---

# Election Data Adapter Boundary

> **Status**: planned · **Priority**: high · **Created**: 2026-07-12

## Overview

Per-election SQLite files are already selected by `electionConfig.id`, and the active query path mostly uses the generic `races → candidacies → people/election_parties` schema. The storage boundary is incomplete, however: Server Actions query Drizzle tables directly, generic rows are translated back into a legacy `Candidate` shape containing `ward`, and fallback helpers expose Auckland-specific storage details.

Introduce one stable application-facing election data interface so actions, prompts, ranking, and UI use generic seat terminology regardless of the backing SQLite schema. Existing databases, including `voting-advisor.db` and `data/elections/auckland-2025.db`, must remain readable without destructive migration.

Related specs: 002 (flexible schema), 003 (NZ electorate support), and 017 (per-election database isolation).

## Design

- Define a small application model for seats, candidates, parties, and election-specific metadata. Shared APIs use `seat`; election-specific UI labels continue to come from `ElectionConfig` (`ward`, `electorate`, etc.).
- Put storage translation behind an election data adapter/repository selected alongside the database connection.
- Use a shared generic-schema adapter for databases containing `races`, `candidacies`, `people`, and `election_parties`.
- Provide a legacy Auckland adapter for databases that only expose `candidates.ward`. The legacy column is read only inside this adapter and translated to the generic application model.
- Keep persisted election-domain values such as `races.kind = 'ward'` valid. They describe a real race type and must not leak into generic API naming.
- Permit adapter-owned election-specific metadata without adding election-specific fields to the common interface. Shared callers consume only the common model unless an explicitly typed capability is introduced.
- Remove legacy application APIs and identifiers rather than preserving aliases; old browser/session compatibility is not required.

The adapter is a storage compatibility boundary, not permission for every election to invent an unrelated schema. New databases should use the generic schema by default; election-specific adapters exist for concrete legacy or genuinely unique requirements.

## Plan

- [ ] Inventory generic callers and classify every production `ward` occurrence as persisted election data, election-specific UI copy, or leaked storage terminology.
- [ ] Define the minimal stable application types and election data adapter contract from current caller needs.
- [ ] Move generic-schema queries out of Server Actions into the shared adapter and make actions delegate to it.
- [ ] Add a legacy Auckland adapter capable of reading existing `voting-advisor.db`-style candidate rows.
- [ ] Rename active APIs, variables, session IDs, tests, and current docs to `seat`; use `electorate` only in NZ-specific UI/domain contexts.
- [ ] Remove `getUniqueWards()`, `getCandidatesByWard()`, and generic `Candidate.ward` exposure after all callers use the adapter.

## Test

- [ ] The NZ 2026 database lists electorates and returns candidates through the generic adapter without any `ward` field in the application model.
- [ ] Existing Auckland databases list wards and candidates through the same generic interface without modifying their schema or data.
- [ ] UI labels render `ward` for Auckland and `electorate` for NZ solely from election configuration.
- [ ] Candidate/race results remain election-isolated when switching configured database files.
- [ ] Production backend code contains no generic `ward` identifiers outside database adapters, schema mappings, and persisted race-kind values.

## Notes

The current code already has the right physical isolation and generic relational schema. This work formalizes the missing translation boundary rather than introducing a second database architecture.