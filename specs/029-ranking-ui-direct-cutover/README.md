---
status: planned
created: 2026-07-18
priority: high
tags:
- ranking
- ui
- cleanup
depends_on:
- 028-deterministic-live-ranking-boundary
parent: 025-deterministic-alignment-scoring-rollout
created_at: 2026-07-18T23:54:27.672377264Z
updated_at: 2026-07-18T23:54:27.672449049Z
---
# Connect the ranking UI and delete the holistic ranker

> **Status**: planned · **Priority**: high

## Goal

Render the canonical deterministic result in the live candidate and party panels, then delete the holistic LLM ranking implementation and obsolete compatibility types in the same workstream.

## Architecture

`page.tsx` supplies one versioned alignment result to presentation components. Candidate and party components render explicit score lanes, evidence coverage, provisional/no-score states, topic contributions, citations, and cohesion warnings. There is exactly one final ranking path; runtime AI may extract claims and classify evidence but never assign final scores.

## Plan

- [ ] Update `src/components/layout/RightPanel.tsx` to accept the canonical alignment result rather than legacy ranked matches.
- [ ] Update `CandidateList.tsx`, `CandidateCard.tsx`, `CandidateModal.tsx`, and `ComparisonView.tsx` to show personal, affiliated-party, and combined electorate compatibility with coverage and provisional/no-score treatment.
- [ ] Update `PartyList.tsx` to show independent party-vote compatibility, coverage, topics, and citations.
- [ ] Add accessible citation links and a separately labelled party-cohesion warning; never present missing evidence as disagreement.
- [ ] Add component tests for sparse evidence, independents, equal scores, candidate/party disagreement, and cited supporting/opposing contributions.
- [ ] Remove the `rankCandidatesForSession()` call and sequence state from `src/app/page.tsx`.
- [ ] Delete `rankCandidatesForSession()` from `src/lib/actions/chat.ts` and remove `AIChatHandler.rankCandidates()` / `rankParties()` plus their holistic ranking prompts and mock ranking fixtures.
- [ ] Replace or delete legacy `CandidateMatch` / `PartyMatch` adapters and types after searching all consumers; do not leave a second result list behind.
- [ ] Add a regression test proving conversation/ranking does not make an LLM final-score call.
- [ ] Run the local Auckland Central flow in `AI_MODE=mock`, reload it, inspect citations, and verify candidate and party ordering.
- [ ] Commit with `jj` after presentation contracts, component rendering, and legacy deletion units.

## Test and verification

- Add focused component tests under `tests/components/` or the repository's existing Vitest convention.
- Update chat-handler/action tests to assert final ranking methods no longer exist in the runtime path.
- Search `src` for `rankCandidatesForSession`, holistic ranking prompts, and old score adapters; expected result is no live ranking consumer.
- Run `bun run test`, `bunx tsc --noEmit`, `bun run lint`, and `bun run build`.
- Browser-smoke Auckland Central candidate and party-vote views in desktop and mobile layouts.

## Done when

The right panel displays only deterministic results with clear coverage and citations, AI-generated final scores are impossible through the live code path, and all obsolete holistic-ranking code and adapters are deleted.

## Non-goals

- Feature flags, shadow comparison, rollback logic, or preserving old score parity.
- Expanding nationwide source coverage.
