---
status: complete
created: 2026-06-28
priority: high
tags:
- mmp
- ui
- party-ranking
parent: '003'
created_at: 2026-06-28T07:55:55.982432999Z
updated_at: 2026-06-30T07:57:09.275853162Z
completed_at: 2026-06-30T07:57:09.275853162Z
transitions:
- status: in-progress
  at: 2026-06-29T10:47:59.862365308Z
- status: complete
  at: 2026-06-30T07:57:09.275853162Z
---

# MMP party-vote matching panel

> **Status**: planned · **Priority**: high · **Created**: 2026-06-28

## Overview

NZ MMP has two independent votes. The existing right panel is candidate-centric:
it shows matching electorate candidates. For a proper MMP experience we also
need a first-class **party vote** view, because many users want to compare
parties separately from the candidate standing in their electorate.

This is a child of spec 003 and should be implemented before evidence-backed
ranking polish in spec 009.

## Design

Add a party-ranking lane alongside the electorate-candidate lane:

```diagram
Right panel
├── Party vote
│   ├── Party match cards: party name, score, short reason, evidence badges
│   └── Sorted across all parties in the active election
└── Electorate vote
    ├── Candidate match cards: candidate, party, score, short reason
    └── Filtered to the selected electorate
```

Desktop can use tabs or stacked sections; mobile can use tabs/accordion. The
important product contract is that party and candidate matches are separate
lists with separate explanations.

## Plan

- [x] Add a typed `PartyMatch` model parallel to `CandidateMatch`.
      `PartyMatch` + `PartySummary` in
      [`src/types/index.ts`](../../src/types/index.ts).
- [x] Add a server/database action to list/rank all parties for the active
      election from `election_parties`.
      `getPartiesForCurrentElection()` in
      [`src/lib/actions/database.ts`](../../src/lib/actions/database.ts)
      (scoped to `electionConfig.id`, returns lightweight serializable rows).
- [x] Update chat/ranking response shape to carry both `candidateMatches` and
      `partyMatches` without conflating scores.
      `RankingResponse.partyMatches` + `AIChatHandler.rankParties()`; the two
      lanes are ranked in parallel and `rankCandidatesForSession` now takes an
      optional `availableParties` arg.
- [x] Update `RightPanel` to render party-vote and electorate-vote sections.
      New [`PartyList`](../../src/components/candidates/PartyList.tsx) component;
      `RightPanel` shows a **Party Vote** card above the renamed **Electorate
      Vote** card when party matches exist.
- [x] Preserve existing candidate sidebar behavior while adding party matches.
      Non-MMP elections pass no parties → party section hidden and the
      candidate card keeps its original "Candidate Matches" title; party scores
      update via a separate setter so they never overwrite candidate scores.
- [x] Add empty/loading states for missing party evidence.
      `PartyList` renders an empty-state message; unranked party cards (neutral
      score, dashed/dimmed via the existing low-confidence styling) seed
      immediately on load.
- [x] Add responsive UX decision: tabs vs stacked sections.
      **Decision: stacked sections.** Two stacked cards read top-to-bottom and
      work on mobile without extra tab state; the existing mobile
      Questions/Candidates toggle already separates the panel from the chat.

## Test

- [x] Unit test: active NZ election returns all parties for party matching.
- [x] Unit test: electorate candidate list is unchanged when party matches are
      added.
- [~] Component test: right panel displays party and electorate sections
      independently. Component/JSX tests are disabled in this repo (Vitest runs
      in the `node` environment and the project's JSX transform fails on
      component tests — see `component-renderer.test.disabled.ts`). Behavior is
      covered structurally via the handler/action tests instead; revive when the
      JSX test setup is fixed.
- [x] Mock chat flow returns both lists deterministically.

Tests live in
[`tests/unit/party-matching.test.ts`](../../tests/unit/party-matching.test.ts)
(4 tests, run under `bun run test`). The mock ranking fixture was broadened to
match slug party ids so the shared `candidate_ranking` path is deterministic for
either lane.

## Notes

Party ranking is heuristic/LLM-backed for now: a single structured ranking call
scores parties from the user's stated preferences (no RAG, no citations).
Evidence-backed party ranking and `sources` citations belong to spec 009 once
the evidence-scope cleanup (spec 018) is in place — `PartyMatch.sources` already
exists for that to populate. Spec 020 wires the conversation/prompts to feed
this party lane.
