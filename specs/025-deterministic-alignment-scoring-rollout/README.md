---
status: in-progress
created: 2026-07-18
priority: high
tags:
- ranking
- scoring
- evaluation
depends_on:
- 023-dynamic-claim-session-pipeline
- incremental-evidence-relationships
parent: 021-structured-voter-profile-ranking
created_at: 2026-07-18T21:04:21.373200372Z
updated_at: 2026-07-18T21:04:21.373270151Z
---
# Deterministic alignment scoring and direct integration

> **Status**: in-progress · **Priority**: high · **Created**: 2026-07-18

## Overview

Replace holistic LLM candidate/party ranking with a pure, versioned scorer over accepted voter claims and classified evidence relationships. Expose compatibility separately from evidence coverage and keep electorate personal, affiliated-party, combined, and party-vote results distinct.

## Design

- Score accepted active claims once using voter-confirmed importance; unresolved claims do not score.
- Map relationship categories with versioned values (+1, +0.5, unknown, -0.5, -1) while interpretation confidence affects evidence sufficiency, not category meaning.
- Aggregate a bounded set of deduplicated independent passages per claim and subject; statement volume cannot increase weight.
- Missing evidence is unknown. Return compatibility, weighted coverage, confidence, topic contributions, citations, input versions, and provisional/usable status.
- Party-vote uses official-party evidence only. Electorate results show personal and affiliated-party scores separately plus a labelled combined score. Independents omit party score.
- Combined weighting starts near equal and shifts only within a versioned cap using weighted claim coverage, never passage count.
- Member disagreement produces a separate cited cohesion warning/confidence reduction and never rewrites official-party compatibility.
- Replace the holistic LLM ranker directly when the evidence-to-score path and
  result UI are connected. Delete the old ranker and obsolete adapters rather
  than retaining feature flags, fallback paths, shadow mode, or rollback logic.

## Plan

- [x] Define versioned scoring/result schemas and pure bounded aggregation helpers.
- [x] Implement party-vote, personal, affiliated-party, combined, topic, coverage, confidence, tie-break, and provisional-status calculations.
- [x] Add stable profile/input hashes and derived-result cache invalidation.
- [ ] Complete [Spec 028](../028-deterministic-live-ranking-boundary/README.md): expose one canonical deterministic application result.
- [ ] Complete [Spec 029](../029-ranking-ui-direct-cutover/README.md): project that result into the UI and delete the holistic ranker.
- [ ] Complete [Spec 030](../030-alignment-human-review-calibration/README.md): human-review the Auckland Central fixtures and calibrate versioned constants.
- [ ] Confirm Spec 029 left the scorer as the only ranking path with no holistic LLM ranker or obsolete compatibility adapters.

## Test

- [x] Golden fixtures lock relationship mapping, bounded independence, source/recency handling, importance, coverage, confidence, lanes, and tie-breaks.
- [x] Missing evidence lowers coverage rather than compatibility; low-coverage results remain visible and provisional.
- [x] Candidate ordering follows combined score regardless of coverage warning; independents have no fabricated party score.
- [x] Duplicate passage volume cannot alter a claim or combined weighting.
- [x] Candidate and party-vote lanes are deterministic and independent.
- [x] Member disagreement affects cohesion/confidence only, not official-party compatibility.
- [x] Profile/corpus/config changes invalidate cached rankings and unchanged inputs hit the cache.
- [x] Evaluation fixtures cover negation, trade-offs, corrections, conflicts, sparse evidence, duplicates, and ties.

## Notes

Exact evidence limits, coverage threshold, source/recency weights, and presentation bands are versioned hypotheses. Calibrate them from evaluation data rather than treating an initial constant as established truth.

- 2026-07-19 review follow-up: lane ranking now returns an explicit `no-score`
  result when the canonical profile has no eligible resolved claim. Cache identity
  fingerprints the complete effective scoring configuration, not only its version
  label. Tested Spec 023/024 adapters preserve numeric claim revisions, treat
  nullable confirmed importance as unresolved, and project both candidacy and
  person passages into the candidate-personal evidence lane. Relationship
  categories share one hyphenated contract. Live UI wiring remains deferred until
  accepted-corpus evidence retrieval is connected.

- Direct integration is still blocked by data and UI work: the committed NZ 2026
  corpus has 13 party-policy sources but no candidate-personal evidence. Connect
  Spec 024 orchestration, add candidate coverage and the result projection, run
  human-labelled evaluation, then remove the old ranker. No rollout or fallback
  infrastructure is required.

## Remaining direct-integration work

- Collect candidate-personal evidence; the current corpus covers party policy
  only.
- Connect accepted voter claims to background evidence retrieval and pairwise
  classification from Spec 024.
- Project personal, affiliated-party, combined, party-vote, coverage, citations,
  and cohesion results into the live candidate and party panels.
- Review the fixed fixtures with humans and adjust versioned scoring constants
  where the results are unreasonable.
- Make the deterministic scorer the only ranking path and delete the holistic
  LLM ranker and obsolete adapters in the same change.
