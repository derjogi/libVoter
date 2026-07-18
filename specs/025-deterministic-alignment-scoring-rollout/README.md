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
# Deterministic alignment aggregation, evaluation, and rollout

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
- Keep the legacy ranker behind an environment feature flag until fixed golden and human-reviewed evaluation gates pass.

## Plan

- [x] Define versioned scoring/result schemas and pure bounded aggregation helpers.
- [x] Implement party-vote, personal, affiliated-party, combined, topic, coverage, confidence, tie-break, and provisional-status calculations.
- [x] Add stable profile/input hashes and derived-result cache invalidation.
- [ ] Add candidate/party UI projection with separate scores, coverage, provisional treatment, citations, and cohesion warning.
- [ ] Add fixed golden and human-labelled evaluation fixtures plus latency/cache/token aggregate metrics without raw political text.
- [ ] Add shadow comparison and feature-flagged rollout; legacy parity is diagnostic, not correctness.

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
  production evidence retrieval is complete.

- Production rollout is intentionally still blocked: the committed NZ 2026
  corpus has 13 party-policy sources but no candidate-personal evidence. The
  scorer therefore remains a verified pure core behind the unchanged legacy UI
  until Spec 024 orchestration, candidate coverage, human-labelled evaluation,
  shadow metrics, and the feature flag are implemented.
