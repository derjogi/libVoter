---
status: planned
created: 2026-06-28
priority: high
tags:
- mmp
- ui
- party-ranking
parent: '003'
created_at: 2026-06-28T07:55:55.982432999Z
updated_at: 2026-06-28T07:55:55.982550576Z
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

- [ ] Add a typed `PartyMatch` model parallel to `CandidateMatch`.
- [ ] Add a server/database action to list/rank all parties for the active
      election from `election_parties`.
- [ ] Update chat/ranking response shape to carry both `candidateMatches` and
      `partyMatches` without conflating scores.
- [ ] Update `RightPanel` to render party-vote and electorate-vote sections.
- [ ] Preserve existing candidate sidebar behavior while adding party matches.
- [ ] Add empty/loading states for missing party evidence.
- [ ] Add responsive UX decision: tabs vs stacked sections.

## Test

- [ ] Unit test: active NZ election returns all parties for party matching.
- [ ] Unit test: electorate candidate list is unchanged when party matches are
      added.
- [ ] Component test: right panel displays party and electorate sections
      independently.
- [ ] Mock chat flow returns both lists deterministically.

## Notes

Party ranking can start heuristic/mock-backed. Evidence-backed party ranking and
citations belong to spec 009 once the evidence-scope cleanup is in place.
