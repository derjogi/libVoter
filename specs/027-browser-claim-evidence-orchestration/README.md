---
status: planned
created: 2026-07-18
priority: high
tags:
- evidence
- ranking
- client
depends_on:
- 023-dynamic-claim-session-pipeline
- 026-auckland-central-candidate-evidence-slice
parent: 024-incremental-evidence-relationships
created_at: 2026-07-18T23:54:27.619678119Z
updated_at: 2026-07-18T23:54:27.619741379Z
---
# Connect voter claims to browser-local evidence relationships

> **Status**: planned · **Priority**: high

## Goal

Make each accepted or revised voter claim automatically retrieve relevant accepted passages for every eligible Auckland Central candidate and party, classify the claim/passage pairs, and cache the resulting relationships in the browser without delaying the next question.

## Architecture

SQLite remains authoritative for accepted corpus passages. Server Actions are stateless bounded ports for corpus lookup, retrieval, and configured-provider classification; they never retain voter claims. Relationship records and work progress are browser-local derived state keyed by claim semantic revision, passage content revision, and classifier version. Reset removes that derived cache.

## Plan

- [ ] Add `src/lib/server/evidence/accepted-corpus.ts` to load only the single accepted revision for a corpus key and reject incomplete or mixed revisions.
- [ ] Implement normalized lexical and semantic `RetrievalPorts` in `src/lib/server/evidence/retrieval-ports.ts`; search candidacy, person, and official-party subjects independently.
- [ ] Add strict bounded input/output schemas and `src/lib/actions/evidence-relationships.ts`. Inputs contain only the claim text/conditions needed for classification plus eligible subject IDs; omit session and provenance IDs.
- [ ] Add a deterministic mock classifier path and tests proving `AI_MODE=mock` makes no paid AI or embedding call.
- [ ] Add `src/lib/client/evidence/relationship-storage.ts` with a versioned localStorage schema. Malformed or stale entries are discarded, and reset clears the whole derived cache.
- [ ] Add `src/lib/client/evidence/use-relationship-orchestration.ts` around `planRelationshipWork()`. Reuse cache hits, schedule only missing tuples, expose completed/pending/failed counts, and ignore stale completions after reset or claim revision.
- [ ] Wire the hook into `src/app/page.tsx` after accepted claim changes. Start the work independently from next-question generation.
- [ ] Render compact relationship-work progress near the local preference/ranking status; do not block ordinary conversation.
- [ ] Add a browser integration test covering answer → accepted claim → retrieval → classification → cached relationship → reload reuse.
- [ ] Commit with `jj` after the server retrieval/action unit, browser cache unit, and page orchestration unit.

## Test and verification

- `bun run test tests/unit/evidence-retrieval-plan.test.ts tests/unit/evidence-relationships.test.ts`
- Add `tests/unit/evidence-relationship-action.test.ts`, `tests/unit/relationship-storage.test.ts`, and `tests/unit/use-relationship-orchestration.test.ts`.
- Prove every eligible subject receives its own retrieval budget and a prolific candidate cannot starve a sparse candidate.
- Prove retagging alone reuses relationships, while a semantic claim revision or passage revision reclassifies.
- Prove reset and race change prevent pending results from repopulating old state.
- `bunx tsc --noEmit && bun run lint && bun run build`.

## Done when

A real accepted claim triggers complete browser-local relationship work over the accepted Auckland Central corpus, unchanged work survives reload and is reused, changed inputs invalidate exactly their dependent tuples, and no voter data is persisted server-side.

## Non-goals

- Computing final compatibility scores.
- Writing voter claims or relationships to SQLite.
- Waiting for all relationships before showing the next question.
