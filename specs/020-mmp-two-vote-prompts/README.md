---
status: planned
created: 2026-06-28
priority: high
tags:
- mmp
- prompts
- chat
parent: '003'
created_at: 2026-06-28T07:55:56.027355924Z
updated_at: 2026-06-28T07:55:56.027455717Z
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

- [ ] Add MMP/two-vote fields to chat/session state.
- [ ] Update prompt templates to mention party vote and electorate vote for MMP
      elections only.
- [ ] Add prompt variables for current party rankings and candidate rankings.
- [ ] Add a question-intent marker so the UI can show whether a question informs
      party vote, electorate vote, or both.
- [ ] Ensure non-MMP elections keep current prompt behavior.
- [ ] Add mock-mode fixtures for two-vote questions and responses.
- [ ] Update onboarding/help copy with a short MMP explanation.

## Test

- [ ] Prompt unit test: NZ 2026 system/component prompts include party-vote and
      electorate-vote language.
- [ ] Prompt unit test: Auckland/non-MMP prompts do not mention party vote.
- [ ] Chat-handler test: mock mode can produce a question tagged as party,
      electorate, or both.
- [ ] End-to-end smoke: selecting an electorate then answering questions updates
      both match lanes when spec 019 is implemented.

## Notes

This spec should coordinate with spec 019. Spec 019 creates the party display
lane; this spec teaches the conversation and prompts how to feed that lane.
