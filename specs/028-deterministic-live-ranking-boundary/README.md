---
status: planned
created: 2026-07-18
priority: high
tags:
- ranking
- scoring
- integration
depends_on:
- 027-browser-claim-evidence-orchestration
parent: 025-deterministic-alignment-scoring-rollout
created_at: 2026-07-18T23:54:27.648339946Z
updated_at: 2026-07-18T23:54:27.648395198Z
---
# Build the deterministic live-ranking application boundary

> **Status**: planned · **Priority**: high

## Goal

Create one tested application boundary that converts the canonical Spec 023 profile, accepted Spec 024 passages, and browser-local relationships into deterministic electorate and party-vote results. The UI should consume this result instead of assembling scorer internals itself.

## Architecture

Keep scoring pure and browser-local. A thin client application service owns lane assignment, subject identity, passage signals, adapters, cache identity, and ranking calls. It returns a versioned UI-neutral result containing personal, affiliated-party, combined, party-vote, coverage, confidence, topics, and citations—including explicit `no-score` results.

## Plan

- [ ] Define the versioned application result contract in `src/types/alignment-results.zod.ts`, including pending, no-score, provisional, and usable states.
- [ ] Add failing contract tests for independents, missing evidence, incomplete relationship work, and separate electorate/party-vote lanes.
- [ ] Implement `src/lib/client/ranking/deterministic-ranking.ts` using `alignment-adapters.ts` and `alignment.ts`; do not duplicate scoring formulas.
- [ ] Add a single passage-signal policy with versioned source-quality and recency inputs. Reject missing or out-of-range signals rather than inventing neutral values.
- [ ] Add `src/lib/client/ranking/use-deterministic-ranking.ts` to recompute only when profile, corpus, relationships, eligible subjects, or scoring config changes.
- [ ] Add an Auckland Central integration fixture that exercises claim → classified relationships → scorer result for all five candidacies and party-vote subjects.
- [ ] Prove scorer output is byte-for-byte stable for identical effective inputs and changes when relevant profile/corpus/config inputs change.
- [ ] Wire the result into `src/app/page.tsx` as the sole ranking state supplied to the next UI task, but do not redesign cards in this spec.
- [ ] Commit with `jj` after the result contract, application service, hook, and page-boundary units.

## Test and verification

- Extend `tests/unit/alignment-scoring.test.ts` and `tests/unit/alignment-scoring-adapters.test.ts`.
- Add `tests/unit/deterministic-live-ranking.test.ts` and `tests/unit/use-deterministic-ranking.test.ts`.
- Verify no eligible claims produces `no-score`, missing evidence lowers coverage rather than compatibility, and candidate/party lanes remain independent.
- Verify candidate ordering is deterministic and an independent candidate has no fabricated party result.
- `bun run test`, `bunx tsc --noEmit`, `bun run lint`, and `bun run build`.

## Done when

One function/hook produces the complete canonical ranking result from browser-local state, Auckland Central passes end-to-end integration fixtures, and no application consumer needs to understand raw evidence relationships or scorer internals.

## Non-goals

- Visual card design.
- Keeping the holistic LLM score as a fallback or comparison path.
- Changing scoring constants without reviewed evidence.
