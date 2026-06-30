---
status: complete
created: 2026-06-28
priority: high
tags:
- mmp
- prompts
- chat
parent: '003'
created_at: 2026-06-28T07:55:56.027355924Z
updated_at: 2026-07-02T11:18:32.925340175Z
completed_at: 2026-07-02T11:18:32.925340175Z
transitions:
- status: in-progress
  at: 2026-06-30T07:57:41.222025964Z
- status: complete
  at: 2026-07-02T11:18:32.925340175Z
---

# MMP two-vote conversation and prompt wiring

> **Status**: planned · **Priority**: high · **Created**: 2026-06-28

## Overview

The chat currently asks generic voting-preference questions and ranks candidates.
For NZ MMP it must understand that voters cast two independent votes:

1. **Party vote**: determines proportional party representation.
2. **Electorate vote**: chooses the local electorate MP.

The conversation should help users reason about both without implying that the
best party match and best local candidate must be the same party.

## Design

Prompt variables and state should distinguish:

- party-vote preferences and ranked parties;
- electorate-vote preferences and ranked local candidates;
- shared issue priorities that affect both;
- explicit educational copy explaining MMP when useful.

The model should be allowed to ask questions that target either lane, e.g.:

- "For your party vote, how important is climate policy compared with tax?"
- "For your electorate vote, do you care more about local advocacy or party
  alignment?"

## Plan

- [x] Add MMP/two-vote fields to chat/session state.
      `voteLane` ("party" | "electorate" | "both") flows through
      `ChatTurnSchema` → `ChatResponse` → `useChat` (persisted as
      `chat:voteLane`).
- [x] Update prompt templates to mention party vote and electorate vote for MMP
      elections only.
      Shared [`mmp-guidance.ts`](../../src/lib/server/prompts/mmp-guidance.ts)
      injected into `AIChatHandler.buildSystemPreamble()` (live chat turn) and
      `PromptManager.buildSystemMessage()` (component selection / question
      generation). Both gate on `votingSystem === "mmp"`.
- [~] Add prompt variables for current party rankings and candidate rankings.
      Deferred: party/candidate rankings are computed in the separate
      background ranking pass (spec 019), not in the per-turn chat prompt, so
      threading live rankings back into the question prompt is left as
      follow-up. The two-vote framing and lane targeting (the behavioral core)
      are in place.
- [x] Add a question-intent marker so the UI can show whether a question informs
      party vote, electorate vote, or both.
      `voteLane` on the chat turn; the model is instructed to tag each question.
- [x] Ensure non-MMP elections keep current prompt behavior.
      `mmpVotingGuidance()` returns "" for non-MMP; `voteLane` is dropped in
      `processMessage` unless MMP. Byte-identical preamble for Auckland.
- [x] Add mock-mode fixtures for two-vote questions and responses.
      `MOCK_CHAT_TURN.voteLane = "both"` (spec 006 mock mode).
- [x] Update onboarding/help copy with a short MMP explanation.
      Header subtitle explains the two votes for MMP elections; a per-question
      "Informs your party/electorate/both vote(s)" badge shows the lane marker.

## Test

- [x] Prompt unit test: NZ 2026 system/component prompts include party-vote and
      electorate-vote language.
- [x] Prompt unit test: Auckland/non-MMP prompts do not mention party vote.
- [x] Chat-handler test: mock mode can produce a question tagged as party,
      electorate, or both.
- [~] End-to-end smoke: selecting an electorate then answering questions updates
      both match lanes. Covered at the unit level (spec 019
      `party-matching.test.ts` + this spec's `mmp-prompts.test.ts`); a Playwright
      E2E is out of scope here (the repo's E2E currently hits real LLMs).

Tests in
[`tests/unit/mmp-prompts.test.ts`](../../tests/unit/mmp-prompts.test.ts)
(5 tests, `bun run test`).

## Notes

This spec coordinates with spec 019: 019 creates the party display lane, this
spec teaches the conversation/prompts to feed it. Party ranking remains
heuristic (spec 019); evidence-backed party citations and threading live
rankings into the question prompt belong to spec 009 / a follow-up.
