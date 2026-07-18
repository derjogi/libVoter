---
status: in-progress
created: 2026-07-18
priority: high
tags:
- ranking
- rag
- evidence
depends_on:
- 010-scrape-sources
parent: 021-structured-voter-profile-ranking
created_at: 2026-07-18T21:04:21.346001330Z
updated_at: 2026-07-18T21:34:20.087135263Z
---
# Incremental evidence relationships and corpus publication

> **Status**: in-progress · **Priority**: high · **Created**: 2026-07-18

## Overview

Build the normalized evidence side of Spec 021 without storing voter profiles server-side. Canonical source passages and corpus revisions live in SQLite; pairwise voter-claim/evidence classifications remain browser-local derived state keyed by content revisions. Retrieval finds relevant evidence but never assigns compatibility scores.

## Design

- Publish immutable corpus revisions; runtime reads accepted passages from one active revision only.
- Resolve subjects explicitly as candidacy, person, or official party. Campaign material belongs to a candidacy, historical records to a person, and manifestos/policies to a party.
- Derive passage identity and independence keys from source lineage and verified source spans; content changes invalidate dependent classifications.
- Retrieve incrementally with semantic and lexical signals across every eligible subject so a prolific subject cannot starve a sparse one.
- Classify each voter-claim/passage pair as aligned, partially-aligned, unclear, partially-opposed, or opposed, with separate interpretation confidence and reason.
- Cache browser-local relationships by claim semantic revision, passage content revision, and classifier version. Retagging alone preserves the cache key.
- Preserve candidate, official-party, and member-cohesion evidence as separate provenance lanes. No relationship category is a final score.

## Plan

- [x] Add corpus revision and normalized source-passage schemas with subject identity, lineage, content revision, span, status, and indexes.
- [x] Add deterministic publication/invalidation helpers and a small accepted fixture corpus.
- [x] Add hybrid retrieval across eligible candidacy/person/party subjects with bounded, deduplicated results per subject.
- [x] Add strict pairwise-classification schemas, deterministic mock output, and browser-local relationship cache projection.
- [x] Add incremental work planning/progress so unchanged claim/passage/classifier tuples are reused.
- [ ] Complete [Spec 027](../027-browser-claim-evidence-orchestration/README.md): wire changed accepted claims to background retrieval/classification and browser-local caching without blocking next-question generation.

## Test

- [x] Source changes invalidate old passage relationships and incomplete corpus revisions never publish.
- [x] Subject identity and citation spans remain explicit and provenance-separated.
- [x] Duplicate source lineage produces one independence contribution.
- [x] Sparse subjects are queried independently; global top-k absence is never recorded as no evidence.
- [x] Relationship categories distinguish topical/unclear, support, and opposition; confidence is not folded into category value.
- [x] Cache hits reuse unchanged semantic revisions; retagging alone does not reclassify.
- [x] Mock mode performs no paid AI or embedding calls and returns stable cited relationships.

## Notes

This child depends on Spec 010 for production-shaped source data, but schemas, publication rules, retrieval ports, fixtures, and cache behavior can be implemented before every external adapter is complete. Browser-local relationship state preserves Spec 023's privacy boundary.

Implemented 2026-07-19 with strict RED/GREEN coverage. Canonical SQLite stores only corpus revisions and normalized passages; relationship schemas, cache projection, mock classification, and incremental work state live under the browser-local client boundary. Runtime scoring remains deferred to Spec 025. Background orchestration from accepted claim changes remains unchecked for the Spec 023 integration lane.

Review follow-up added a partial unique index enforcing one accepted revision per
corpus key and a transactional publication adapter that atomically supersedes the
predecessor and inserts the replacement with all passages. Passage ids are
revision-scoped, independence is derived from validated source lineage, and
changed or removed sources receive explicit invalidation metadata. End-to-end
integration remains open: the committed NZ 2026 corpus currently contains only
13 party-policy sources and no candidate-personal source coverage.