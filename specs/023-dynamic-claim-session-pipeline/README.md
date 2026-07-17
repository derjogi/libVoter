---
status: in-progress
created: 2026-07-18
priority: high
tags:
- preferences
- session
- ai
- privacy
parent: 021-structured-voter-profile-ranking
created_at: 2026-07-18T09:53:50.694324252Z
updated_at: 2026-07-18T09:55:03.868761457Z
transitions:
- status: in-progress
  at: 2026-07-18T09:55:03.868761457Z
---

# Local session and dynamic claim pipeline

> **Status**: planned · **Priority**: high · **Created**: 2026-07-18

## Overview

Replace the current split browser keys and prose-only preference reconstruction
with one browser-authoritative, schema-versioned session snapshot and a shadow
profile of dynamic voter claims. Question generation remains responsive: it uses
the latest exact Q/A plus previously accepted claims while claim extraction runs
in parallel. This child does not change visible ranking.

The snapshot is local-only. Configured AI providers may receive the latest exact
Q/A and compact prior claims, but the application stores no server session, omits
session/provenance ids from prompts, and does not log raw political content in
production or shadow metrics.

## Design

- Persist one `SessionSnapshot` under a new storage key; old test-only keys are
  discarded rather than migrated.
- Store ordered transcript responses, accepted claim revisions, pending
  extraction state, selected race, and profile version together. Ranking remains
  disposable derived state.
- Claims preserve unrestricted text, conditions/qualifiers, voter-confirmed
  importance, and zero or more free-form topic tags. Tags are non-exclusive
  display/planning metadata and never multiply scoring weight.
- A same-position clarification creates a new revision of the same claim; a
  distinct position creates a new claim. Uncertain merges remain pending.
- AI extraction returns only constrained operations and content. Trusted ids,
  provenance, revision, status, and timestamps are assigned by the reducer.
- Every async result carries its response id and base profile version. Apply in
  response order, queue results awaiting predecessors, and reject stale results.
- Next-question and extraction calls start after recording the response. The
  question call uses compact accepted claims, latest verbatim Q/A, and compact
  asked-question/topic coverage; only accepted extraction results alter claims.
- AI proposes claim importance. The voter may confirm/reorder it later; accepted
  claim importance is the single future scoring weight.

## Plan

- [x] Add Zod schemas/types for snapshot, dynamic claim revisions, constrained
      extraction operations, and pending/failed extraction state.
- [ ] Add a pure reducer with stable injected UUID/time dependencies,
      idempotency, in-order application/queueing, revision history, retagging,
      importance confirmation, and reset behavior.
- [ ] Replace split persistence with a single schema-validated snapshot hook and
      new namespace; clear old test-only keys without migration.
- [ ] Add a server action that extracts constrained claim operations from exact
      Q/A plus a prompt-safe compact prior-claim projection. Add deterministic
      mock responses and redact raw content from logs.
- [ ] Run next-question generation and extraction in parallel; merge accepted
      results into the snapshot without delaying the displayed next question.
- [ ] Expose shadow extraction status/progress without changing current ranking;
      add user disclosure and reset semantics.

## Test

- [ ] Snapshot hydration rejects malformed/unknown schema versions safely.
- [x] Duplicate response/result delivery is idempotent and out-of-order results
      queue until prior response extraction resolves.
- [ ] Same-claim clarification preserves history; distinct claims stay separate;
      uncertain operations remain pending.
- [ ] Multiple dynamic topic tags round-trip; retagging alone does not change the
      claim's semantic revision or future score identity.
- [ ] Extraction cannot choose trusted ids/provenance/status/timestamps and never
      creates a claim from seat selection.
- [ ] Next-question generation starts without awaiting extraction and receives
      latest exact Q/A plus only compact accepted prior claims.
- [ ] Prompt payloads omit session/provenance ids; production logs and shadow
      metrics contain no raw answers or claims.
- [ ] Reset clears the single snapshot and derived caches; old split-key test
      sessions are discarded without an extraction call.
- [ ] Mock mode performs no paid AI calls and returns stable claim operations.

## Notes

- Full candidate/party evidence relationships and ranking belong to later Spec
  021 children and remain blocked by Spec 010/evaluation contracts.
- Cross-device and durable server sessions are intentionally out of scope.
- 2026-07-18: Added strict model-output schemas plus the pure reducer foundation.
  The reducer assigns trusted UUID/provenance fields, records responses
  idempotently, preserves claim revisions, queues out-of-order results, and marks
  results stale when their base profile version no longer matches. Full tests
  pass (201 passed, 2 skipped); build and lint pass with existing warnings.
