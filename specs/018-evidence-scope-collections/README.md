---
status: in-progress
created: 2026-06-28
priority: high
tags:
- rag
- data
- architecture
depends_on:
- '017'
created_at: 2026-06-28T07:55:55.948648781Z
updated_at: 2026-06-28T07:55:55.948733462Z
---

# Election vs reference evidence collections

> **Status**: in-progress · **Priority**: high · **Created**: 2026-06-28

## Overview

Spec 017 split SQLite storage into per-election DB files plus `reference.db`,
but the Chroma naming still implied that all evidence belonged to
`evidence-${electionId}`. That is misleading for NZ and does not scale to other
countries.

We need an explicit evidence-scope model:

- **Election evidence**: campaign / candidate / party policy material scoped to
  one election snapshot. For NZ 2026 this lives in `data/elections/nz-2026.db`
  and Chroma collection `election-nz-2026`.
- **Reference evidence**: reusable institutional corpora such as Hansard,
  Parliament speeches, voting records, or future country-specific legislative
  corpora. For NZ this lives in `data/reference.db` and should eventually embed
  into `reference-nz-parliament`.

This keeps the app ready for future jurisdictions without using one giant,
easy-to-leak Chroma collection.

## Design

Add evidence scope to the election descriptor:

```ts
evidence: {
  electionCollection: "election-nz-2026",
  referenceCollections: [
    {
      id: "nz-parliament",
      collection: "reference-nz-parliament",
      databaseUrl: "file:./data/reference.db",
    },
  ],
}
```

Runtime ranking continues to query only the active election collection for now.
Spec 009/014 will later add a reference retriever that intentionally queries the
allowed reference collections and merges/reranks those chunks with election
chunks.

## Plan

- [x] Add evidence-scope fields to `ElectionConfig`.
- [x] Rename election-scoped Chroma collection naming from `evidence-${id}` to
      `election-${id}`.
- [x] Rebuild the active NZ election collection as `election-nz-2026`.
- [x] Keep `data/reference.db` as the canonical Hansard/reference SQLite DB.
- [ ] Build/populate `reference-nz-parliament` Chroma collection once spec 014's
      Hansard backfill is stable.
- [ ] Extend spec 009 retrieval to query both `election-*` and allowed
      `reference-*` collections, with clear evidence scope in citations.

## Test

- [x] Unit tests assert NZ 2026 exposes `election-nz-2026` and
      `reference-nz-parliament` in its election config.
- [x] Unit tests assert `collectionNameForElection("nz-2026")` returns
      `election-nz-2026`.
- [x] Embed smoke verifies `election-nz-2026` contains 479 NZ 2026 party-policy
      chunks and can answer a retrieval query.
- [ ] Reference Chroma smoke test once `reference-nz-parliament` exists.

## Notes

Do not use a single global Chroma collection for all elections/countries. Use
one Chroma server with multiple named collections, and let each election config
choose which collections are visible.
