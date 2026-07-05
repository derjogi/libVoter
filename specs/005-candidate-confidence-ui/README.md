---
status: in-progress
created: 2026-05-03
priority: medium
tags:
- ui
- ai
depends_on:
- '001'
created_at: 2026-05-03T01:39:17.326434544Z
updated_at: 2026-05-03T01:39:17.326434544Z
---

# Candidate-confidence-driven progress + user-controlled stop

> **Status**: planned · **Priority**: medium · **Created**: 2026-05-03

> ⚠️ **Superseded (RAG/ranking design) by [spec 009 — Evidence-retrieval
> RAG](../009-candidate-evidence-rag/README.md).** The RAG-based candidate
> *ranking* approach below is replaced: candidate selection is a structured
> electorate filter, and RAG is repurposed for evidence retrieval +
> citations. The UI/confidence concerns here (always-visible panel,
> "keep asking" / "I'm ready to decide" buttons, margin-based confidence)
> remain valid and are folded into spec 009's Phases 1, 5, 6.

## Overview

Today the right panel reveals candidates when an aggregate confidence
score (heuristic, not match-quality) crosses a threshold AND a minimum
number of interactions have happened. The "confidence" number doesn't
actually measure how confident the system is in its candidate ranking.

Maintainer's intent:

- **Confidence should reflect how confident we are in the current
  candidate / party ranking**, not how many questions the user
  answered.
- **No hard stop** at N candidates. The AI should keep asking questions
  to refine the ranking; the user can stop any time.
- The conversation can naturally peter out when **all key topics are
  covered** and confidence is high — the AI may then *suggest* the user
  has enough information, but the user always has the final say.
- The candidate / party list with current scores should always be
  visible (or one tap away on mobile), not hidden behind a threshold.

## Design

### State

Server-side per-session state grows two fields:

```ts
{
  rankedCandidates: CandidateMatch[];   // re-computed every turn
  coveredTopics: Set<string>;           // matched against electionConfig.keyTopics
}
```

`rankedCandidates` is recomputed after every user response by combining:

- RAG semantic similarity between the running user-profile summary and
  candidate documents (already available via
  [`RAGQueryEngine`](../../src/lib/server/rag/query-engine.ts)),
- the confidence-calculator's per-response weight,
- a per-candidate "amount of evidence" weight (how many of the topics the
  user cares about have actual data on this candidate?).

The single `confidence` number for the UI is derived from the
**spread** of the ranked list:

```ts
const top = ranked[0].score;
const second = ranked[1]?.score ?? 0;
const margin = top - second;
const confidence = clamp(margin * 2 + topicCoverage * 50, 0, 100);
```

A wider margin ⇒ higher confidence in the leader. Topic coverage adds a
floor so we don't claim 100% confidence after one question.

### UI

- Right panel always visible (no `isVisible={confidence > 30}` gate).
- Each candidate card shows its current score and a colour bar; the bar
  re-animates after each turn so the user *feels* the ranking moving.
- Below the list, two persistent buttons:
  - **"Keep asking me"** (primary) — continues the AI flow.
  - **"I'm ready to decide"** (outline) — collapses the question panel
    and shows a final summary card with the user's top picks and the
    AI's reasoning.
- A small "All key topics covered" badge appears once
  `coveredTopics.size === electionConfig.keyTopics.length`. After that
  the AI's question is preceded by a soft "You've covered all the major
  topics — want to keep going or are you ready?" prompt.

### Topic coverage

Add a topic-tagging step: each user response is fed through a small
prompt (`TAG_TOPICS`) returning which of `electionConfig.keyTopics` it
addressed. Cheap (`small` model) and cached. The result feeds
`coveredTopics`.

### Preference-summary refresh cadence

The live preference summary must not invoke the LLM after every answer.
Electorate/ward selection is setup, not a substantive answer, and does not
count toward the cadence.

- Build the first summary after three substantive answers.
- After a summary request, renew it after two more substantive answers.
- Renew it immediately when the latest answer came from a `chat` or
  `freetext` component, provided the first-summary threshold has already been
  reached.
- An immediate free-text renewal resets the two-answer counter.
- Keep the previous summary visible while a renewal is in flight, and issue
  only one request when both renewal conditions match.

## Plan

- [ ] Extend `ChatResponse` (in
      [`chat-handler.ts`](../../src/lib/server/ai/chat-handler.ts)) with
      `rankedCandidates` and `coveredTopics`.
- [ ] Implement `recomputeRanking()` after each turn. Use RAG when there
      are >3 candidates, full LLM scoring (one prompt per candidate) only
      when there are ≤3.
- [ ] Add `TAG_TOPICS` prompt template.
- [ ] Replace the existing `confidence` calculation with a margin-based
      one as above.
- [ ] Update [`page.tsx`](../../src/app/page.tsx) so the right panel is
      always visible and reflects the new ranking on every turn.
- [ ] Add the two persistent buttons + the "ready?" prompt path.
- [ ] When the user clicks "I'm ready to decide", call
      `summarizeUserPreferences` and render a final summary card.

## Test

- [ ] After 1 substantive answer, the candidate list re-orders.
- [ ] Confidence number rises monotonically with topic coverage and
      separation between top candidates (in a happy-path conversation).
- [ ] "I'm ready to decide" can be clicked at *any* point — confidence
      0% included — and produces a summary, not an error.
- [ ] After all key topics are covered, the soft "ready?" prompt appears
      exactly once.
- [ ] Spec-006 mock mode includes a fixture that drives this end-to-end
      deterministically.

## Notes

- Topic-coverage tagging may be the most expensive part of a turn — cache
  per `(userMessageHash, topicSet)`.
- This spec is the one most exposed to UX iteration; resist the urge to
  over-design before seeing it move.

## Dependencies

- **Depends on**: spec 001 (chat handler must work).
- **Benefits from**: spec 002 (richer candidate / party data improves
  ranking quality), spec 004 (Zod-validated outputs prevent ranking
  glitches from bad LLM JSON).
