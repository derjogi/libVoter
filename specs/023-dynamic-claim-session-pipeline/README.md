---
status: complete
created: 2026-07-18
priority: high
tags:
- preferences
- session
- ai
- privacy
parent: 021-structured-voter-profile-ranking
created_at: 2026-07-18T09:53:50.694324252Z
updated_at: 2026-07-18T21:48:15.324474056Z
completed_at: 2026-07-18T21:48:15.324474056Z
transitions:
- status: in-progress
  at: 2026-07-18T09:55:03.868761457Z
- status: complete
  at: 2026-07-18T21:48:15.324474056Z
---

# Local session and dynamic claim pipeline

> **Status**: complete · **Priority**: high · **Created**: 2026-07-18

## Overview

Replace the current split browser keys and prose-only preference reconstruction
with one browser-authoritative, schema-versioned session snapshot and a local
profile of dynamic voter claims. Question generation remains responsive: it uses
the latest exact Q/A plus previously accepted claims while claim extraction runs
in parallel. This child does not change visible ranking.

The snapshot is local-only. Configured AI providers may receive the latest exact
Q/A and compact prior claims, but the application stores no server session, omits
session/provenance ids from prompts, and does not log raw political content in
application logs or evaluation artifacts.

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
- [x] Add a pure reducer with stable injected UUID/time dependencies,
      idempotency, in-order application/queueing, revision history, retagging,
      importance confirmation, and reset behavior.
- [x] Replace split persistence with a single schema-validated snapshot hook and
      new namespace; clear old test-only keys without migration.
- [x] Add a server action that extracts constrained claim operations from exact
      Q/A plus a prompt-safe compact prior-claim projection. Add deterministic
      mock responses and redact raw content from logs.
- [x] Run next-question generation and extraction in parallel; merge accepted
      results into the snapshot without delaying the displayed next question.
- [x] Expose extraction status/progress without changing ranking in this child;
      add user disclosure and reset semantics.

## Test

- [x] Snapshot hydration rejects malformed/unknown schema versions safely.
- [x] Duplicate response/result delivery is idempotent and out-of-order results
      queue until prior response extraction resolves.
- [x] Same-claim clarification preserves history; distinct claims stay separate;
      uncertain operations remain pending.
- [x] Multiple dynamic topic tags round-trip; retagging alone does not change the
      claim's semantic revision or future score identity.
- [x] Extraction cannot choose trusted ids/provenance/status/timestamps and never
      creates a claim from seat selection.
- [x] Next-question generation starts without awaiting extraction and receives
      latest exact Q/A plus only compact accepted prior claims.
- [x] Prompt payloads omit session/provenance ids; application logs and
      evaluation artifacts contain no raw answers or claims.
- [x] Reset clears the single snapshot and derived caches; old split-key test
      sessions are discarded without an extraction call.
- [x] Mock mode performs no paid AI calls and returns stable claim operations.

## Notes

- Full candidate/party evidence relationships and ranking belong to later Spec
  021 children and remain blocked by Spec 010/evaluation contracts.
- Cross-device and durable server sessions are intentionally out of scope.
- 2026-07-18: Added strict model-output schemas plus the pure reducer foundation.
  The reducer assigns trusted UUID/provenance fields, records responses
  idempotently, preserves claim revisions, queues out-of-order results, and marks
  results stale when their base profile version no longer matches. Full tests
  pass (201 passed, 2 skipped); build and lint pass with existing warnings.
- 2026-07-19: Completed browser hydration/persistence, transcript restoration,
  parallel question/extraction orchestration, reset epoch guards, queue rebasing,
  seat-selection isolation, strict bounded action inputs, and privacy-safe logs.
  Ranking integration belongs to Spec 025, which may directly delete and replace
  the old ranker because the project is unreleased and local-only.
