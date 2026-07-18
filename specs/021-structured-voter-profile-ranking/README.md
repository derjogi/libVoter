---
status: in-progress
created: 2026-07-10
priority: high
tags:
- ranking
- preferences
- rag
- ai
depends_on:
- 010-scrape-sources
parent: 009-candidate-evidence-rag
created_at: 2026-07-10T10:18:42.605180991Z
updated_at: 2026-07-17T09:57:16.401874626Z
transitions:
- status: in-progress
  at: 2026-07-17T09:57:16.401874626Z
---
# Structured voter profile and local alignment ranking

> **Status**: in progress · **Priority**: high · **Created**: 2026-07-10

## Overview

Candidate and party ranking currently rebuilds a prose voter profile from all
responses, performs candidate-by-candidate evidence searches, and asks an LLM
to assign the final scores. This is expensive, difficult to calibrate, and
conflates semantic relevance ("this passage discusses housing") with stance
agreement ("this passage supports the voter's housing preference").

Make a structured voter profile the canonical session state. Update it after
every substantive answer, use it to choose the next question, and rank locally
from topic-specific evidence. Limit runtime AI to extracting structured stance
deltas from free text and, optionally, explaining a small number of results.

This spec is a child of spec 009. It replaces spec 009 Phase 5's holistic LLM
ranking call and supplies the compact preference state needed by spec 020's
next-question prompt. Evidence ingestion and citations remain owned by specs
009, 010, and 018.

### Known current bug: question context is dropped

`UserResponse.question` currently stores the visible question, but
`createUserProfileSummary()` ignores it and emits only `questionId: value`.
Generated questions commonly have a meaningless timestamp-based id. Some
components happen to repeat their question inside `value`, while multiselect
and priority responses normally submit only selected labels. Consequently the
same answer can lose its meaning or be interpreted differently depending on
which UI component collected it. Candidate and party ranking both consume this
lossy profile.

Spec 021 fixes the root cause: extraction always receives the latest visible
question and answer verbatim, while structured answers also carry explicit
semantic metadata. As an early compatibility fix, the existing ranker should
format every response from `question ?? questionId` plus the answer rather than
relying on component-specific value formatting.

### Goals

- Preserve the voter's topic, direction, importance, uncertainty, and source.
- Make the next question respond to the newly submitted answer without sending
  the full transcript or candidate corpus.
- Rank deterministically and incrementally; the same inputs must produce the
  same scores.
- Distinguish no evidence from disagreement and expose coverage separately from
  compatibility.
- Keep party-vote and electorate-vote preferences and scores independent while
  allowing shared preferences to inform both.

### Non-goals

- Scraping raw evidence sources. This spec defines the normalized evidence-claim
  contract consumed by ranking; specs 009/010 own source acquisition and may
  host the ingestion implementation.
- Treating embedding similarity as a probability of political agreement.
- Generating an AI-written explanation for every candidate after every answer.

### Accepted direction from the July 2026 design conversation

These decisions supersede conflicting fixed-taxonomy and trusted-component-
metadata proposals later in this umbrella. Split/rewrite those sections into
child specs before implementing beyond the completed compatibility slice.

- Session state is browser-authoritative and persisted as one versioned
  `SessionSnapshot`; server actions remain stateless and retain no voter profile.
- The configured AI provider may receive the latest exact visible Q/A and the
  compact previously accepted claims needed for extraction and adaptive question
  planning. The application does not persist them server-side, omits session and
  provenance identifiers from prompts, and excludes raw answers/claims from
  production logs and shadow metrics. The UI discloses third-party AI processing
  and applicable provider retention terms; reset clears the local snapshot and
  derived caches. Local embeddings do not imply local chat/claim inference.
- Existing test-only split-key sessions are discarded when the new snapshot
  namespace lands; no migration or historical extraction is required.
- The AI may continue generating adaptive questions freely. Structured claims
  are extracted from the exact visible question and answer after submission;
  hidden scoring metadata generated with a question is not trusted.
- Next-question generation does not wait for claim extraction. It uses the
  latest exact raw Q/A, the previously accepted compact claims, and compact
  asked-question/topic coverage so it can respond immediately without blindly
  repeating itself. Claim extraction runs in parallel and affects subsequent
  planning after its validated result joins the snapshot.
- Claims are dynamic, versioned text with zero or more non-exclusive, free-form
  topic tags, not members of a maintained topic or proposition catalogue.
  Conditions and qualifiers remain part of the claim. Topic tags organize UI
  summaries and question planning only; compatibility uses each claim's
  voter-confirmed importance exactly once. Retagging does not change political
  meaning or invalidate claim/evidence scoring relationships.
- Persist claims, source-linked evidence passages, and claim/evidence
  relationships as normalized records. The nested per-claim/per-candidate
  `resonance` map is a UI projection, not the persisted source of truth.
- A clarification or changed view revises the same claim when it concerns the
  same underlying position. The old revision and source response remain in
  history. A genuinely distinct position creates a new claim; uncertain
  same-claim decisions stay pending for clarification rather than auto-merging.
- AI proposes topic/claim importance; the voter can reorder or adjust it before
  final ranking. The accepted result is stored as claim importance rather than a
  second topic multiplier. Final compatibility is claim-weighted, while dynamic
  topic views expose grouped alignment rather than only one opaque overall score.
- Retrieval and pairwise claim/evidence classification run incrementally in the
  background. Cache keys include claim version, evidence content revision, and
  classifier version. The UI exposes pending-work progress and waits only when
  the voter explicitly requests final results.
- Retrieval combines semantic and lexical signals and must be described as
  "relevant evidence found", not all statements. Classify each relationship as
  aligned, partially aligned, unclear, partially opposed, or opposed, with a
  reason and separate interpretation confidence. The versioned numeric mapping
  may use `+1`, `+0.5`, unknown, `-0.5`, and `-1`; those values express the
  category, never model confidence.
- Aggregate the balance of a bounded set of deduplicated, independent evidence
  rather than using one best passage or rewarding statement volume. Preserve
  conflicting and historical evidence, record source authority/recency, and
  produce at most one contribution per voter claim and subject. Exact evidence
  limits, recency/source weights, and presentation bands require evaluation and
  remain open.
- Candidate evidence and official party evidence remain distinct. Member
  consensus or disagreement with official policy is a separately visible party
  cohesion/credibility signal, not silently attributed as the party line.
- For an electorate candidate, show personal compatibility and affiliated-party
  compatibility separately, plus an explicitly labelled combined score. The
  combined score starts near equal personal/party weight and shifts modestly
  toward the side covering more of the voter's weighted claims. Weighting uses
  claim coverage, never passage count; its cap and exact formula are versioned
  and calibrated. Evidence and citations remain provenance-separated.
- Member disagreement does not change the party-policy compatibility score.
  Instead it lowers confidence in the party result and produces a separate,
  cited cohesion warning; alignment and likely adherence remain distinct ideas.
- Alignment and evidence coverage remain separate. Missing evidence is unknown,
  never neutral or opposed.
- Personal, affiliated-party, and combined scores remain visible when applicable,
  even below a versioned minimum usable coverage threshold. Low-coverage scores
  are styled and labelled as provisional/insufficient evidence and reduce result
  confidence, but candidate ordering always follows the combined score. An
  independent candidate has no party score and uses the personal score as the
  combined score. Coverage and compatibility remain separate, and the warning
  threshold is calibrated from evaluation data rather than guessed.

## Historical material

The superseded fixed-taxonomy design was moved to
[`historical-draft.md`](historical-draft.md). It is retained for decision history,
not as implementation guidance.

## Plan


- [x] Add the compatibility fix and regression coverage so the current ranker
      always receives the visible question with every answer before the larger
      profile migration lands. Implemented with the shared
      `formatUserResponses()` path used by candidate ranking, party ranking, and
      preference summaries.
- [x] Split this umbrella into child specs for (1) local session and dynamic
      claims, (2) incremental evidence relationships, and (3) aggregation,
      evaluation, and rollout. Preserve the parallel next-question/extraction
      ordering in the first child.
- [ ] Add one browser-local `SessionSnapshot`, stable UUID identities, a pure
      reducer, dynamic claim extraction, claim revision history, idempotency,
      stale-result rejection, and hashing in shadow mode. Discard old test-only
      split-key sessions; exclude seat selection from political claims.
- [ ] Store zero or more dynamic topic tags on each claim for display/planning
      only. Scoring uses accepted claim importance once; retagging does not
      invalidate evidence relationships or alter compatibility.
- [ ] Enforce the privacy boundary: prompt-safe compact claim projection without
      session/provenance ids, no application-side server retention, raw-data log
      redaction, reset semantics, and user disclosure of configured-provider
      processing/retention.
- [ ] Add normalized source-linked evidence passages and versioned cached
      claim/evidence relationships. Coordinate source revisions, lineage,
      deduplication, and corpus publication with spec 010.
- [ ] Add incremental semantic-plus-lexical retrieval and background pairwise
      classification with visible pending-work progress. Reprocess only changed
      claim/evidence/classifier versions.
- [ ] Add deterministic bounded evidence aggregation, AI-proposed/voter-adjusted
      importance, topic-level results, compatibility versus coverage, and cited
      explanations. Keep candidate, official-party, and member-cohesion signals
      distinct.
- [ ] For electorate candidates, return separate personal and affiliated-party
      results plus a labelled combined result whose capped weighting shifts from
      an equal baseline using weighted claim coverage, not statement volume.
- [ ] Keep official party-policy compatibility unchanged by member disagreement;
      derive a separately cited cohesion warning and confidence reduction.
- [ ] Add explicit low-evidence status, confidence reduction, and strong visual
      treatment while retaining all applicable scores and ordering candidates by
      combined score regardless of coverage. Independents omit the party result
      and use their personal result as combined.
- [ ] Keep the current ranker behind a feature flag until the dynamic-claim
      pipeline passes reviewed coverage and human-labelled quality evaluation;
      parity with the old holistic LLM score is not a correctness criterion.
- [ ] Instrument latency, query count, cache hit rate, token use, ranking
      stability, and evidence coverage; compare against the existing ranking on
      a fixed evaluation set before switching the default.

## Test

- [x] Current-profile regression: dropdown, multiselect, priority, yes/no,
      slider, chat, and freetext responses all preserve visible question plus
      answer; two identical answer strings to different questions remain
      distinguishable.
- [ ] Every response type is extracted from its exact visible Q/A; generated
      hidden component metadata cannot directly create scoring claims.
- [ ] Extraction and next-question prompts contain only the permitted exact Q/A
      and compact prior claims, omit session/provenance ids, and raw political
      content never appears in production logs or shadow metrics.
- [ ] Invalid extraction does not mutate prior state; the answer remains pending
      and can trigger a neutral clarification.
- [ ] Clarifications revise the same claim with history; distinct claims remain
      separate; uncertain merge decisions remain pending.
- [ ] Claims may carry multiple free-form topic tags; changing only tags leaves
      claim/evidence classifications and scores unchanged.
- [ ] Extraction output cannot set trusted identity, provenance, revision, or
      status fields; the reducer assigns them.
- [ ] Unresolved claims and unknown evidence do not affect compatibility and are
      not silently converted to neutral positions.
- [ ] Low-evidence personal/party/combined scores remain visible and clearly
      provisional; coverage changes warnings/confidence but never the combined-
      score ordering. Independents have no fabricated party score.
- [ ] Seat selection never creates a political preference.
- [ ] Retrieval/classification work scales with changed claim/evidence versions,
      cached relationships are reused, and repeated evidence is deduplicated.
- [ ] Local scoring distinguishes supporting, opposing, and merely topical
      evidence; missing evidence lowers coverage rather than compatibility.
- [ ] Candidate and party-vote lanes remain independent and deterministic.
- [ ] Candidate cards expose personal, affiliated-party, and combined results;
      changing duplicate passage volume cannot alter the combined weighting.
- [ ] Member disagreement never rewrites official-policy alignment; it changes
      party-result confidence and the separate cohesion warning only.
- [ ] Profile/version changes invalidate stale ranking results and unchanged
      profiles hit the cache.
- [ ] Duplicate submissions are idempotent; stale outputs are rejected; reset and
      reload preserve the single snapshot consistently; no legacy migration runs.
- [ ] An evidence-rich candidate cannot starve a sparse candidate's retrieval,
      and global vector top-k absence is never treated as proof of no evidence.
- [ ] Golden fixtures lock categorical relationship mapping, bounded independent
      evidence aggregation, source/recency handling, importance, coverage, lane
      separation, confidence, and tie-breaks.
- [ ] Mock-mode tests make no paid AI or embedding calls and return stable
      scores with cited contribution details.
- [ ] Evaluation fixtures cover negation, trade-offs, corrections, uneven
      evidence volume, duplicated sources, sparse candidates, and ties.

## Notes

- 2026-07-17: Completed the compatibility slice. Prompt-facing responses now use
  one shared JSON question/answer formatter with `questionId` fallback for older
  response-only sessions. JSON framing keeps multiline widget output within its
  response record, and prompts explicitly treat fields as untrusted voter data.
  Candidate ranking, party ranking, and the live preference summary all consume
  it. The preference-summary prompt and mock fixture were also corrected to
  summarize voter priorities without inventing candidate context. Regression
  tests cover every current response component type and ambiguous identical
  answers. Full tests, lint, and production build pass.

### Alternatives considered

1. **Combined claim-extraction + next-question call:** one fewer model request,
   but it couples untrusted durable interpretation to conversational generation
   and makes each failure harder to retry independently. Rejected for the first
   version.
2. **Wait for claim extraction before asking the next question:** gives planning
   the newest validated claim set but adds a serial model call to every turn.
   Rejected. The next-question call instead uses the exact latest raw Q/A plus
   previously accepted claims and compact asked-question/topic coverage.
3. **Embed one running prose summary:** cheap, but blends topics, loses
   importance and contradictions, and cannot distinguish agreement from
   opposition. It may remain a weak supplemental retrieval signal only.


Implementation children: Spec 023 owns the browser-local dynamic claim/session pipeline; Spec 024 owns normalized evidence passages and incremental relationships; Spec 025 owns deterministic aggregation, evaluation, UI projection, and rollout.

## Historical architecture review

The pre-resolution architecture review was moved to
[`architecture-review.md`](architecture-review.md). The accepted July 2026
direction and implementation children above are normative.
   ranker only as rollback, not as a mixed fallback within one result list.