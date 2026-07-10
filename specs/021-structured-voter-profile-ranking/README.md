---
status: planned
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
updated_at: 2026-07-10T10:25:26.134463600Z
---

# Structured voter profile and local alignment ranking

> **Status**: planned · **Priority**: high · **Created**: 2026-07-10

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

## Design

### Canonical voter profile

Store atomic preferences rather than one prose summary:

```ts
interface VoterPreference {
  id: string;
  taxonomyVersion: string;
  topic: string;
  proposition: string;
  stance: number; // -1 oppose, 0 explicitly neutral, +1 support
  resolution: "resolved" | "unresolved";
  importance: number; // 0..1
  confidence: number; // 0..1 extraction/answer certainty
  voteLane: "party" | "electorate" | "both";
  sourceResponseIds: string[];
  status: "active" | "superseded";
}

interface VoterProfile {
  taxonomyVersion: string;
  preferences: VoterPreference[];
  version: number;
  appliedResponseIds: string[];
}

interface ExtractedPreference {
  taxonomyVersion: string;
  topic: string;
  proposition: string;
  stance: number | null;
  importance: number;
  confidence: number;
  voteLane: "party" | "electorate" | "both";
  correctsPropositions?: string[];
}

interface StanceExtractionResult {
  taxonomyVersion: string;
  responseId: string;
  baseProfileVersion: number;
  extracted: ExtractedPreference[];
}
```

The profile is persisted with the existing client-side session state. A shared
pure merge module owns its update rules; client orchestration uses it and server
actions revalidate the resulting profile and version. An LLM may return only a
validated `StanceExtractionResult`, never canonical IDs, provenance, status,
specific preference ids to supersede, or a replacement `VoterProfile`. The
merge layer assigns deterministic IDs and `sourceResponseIds`, sets status,
and resolves correction propositions only against active preferences from the
same session. An explicit later correction supersedes the earlier preference
instead of averaging contradictory values. Ambiguous extraction has
`resolution: "unresolved"` and may coexist until a later question resolves it.

Persist the profile as `session:voterProfile` beside `session:steps`, with a
stable persisted `sessionId`. A delta carries `sessionId`, `responseId`, and
`baseProfileVersion`. Applying it is idempotent: ignore an already-applied
response id, reject a stale base version, and increment the version once per
accepted response. Reset clears steps, profile, hashes, and ranking caches
together. On reload, hydrate them as one logical snapshot before accepting a
new answer.

For old response-only sessions, deterministically rebuild responses whose
stored component metadata is sufficient. Mark the remainder `pending` and run
one validated batch extraction from their verbatim questions/answers before
ranking. Do not silently treat an incomplete migration as an empty profile.

### Turn ordering

The preferred turn pipeline is hybrid:

```text
structured answer
  -> deterministic stance delta
  -> merge canonical profile
  -> in parallel:
       next-question call(updated profile + latest Q/A)
       local ranking(updated profile)

free-text answer
  -> small structured stance-extraction call(current profile + latest Q/A)
  -> validate delta and merge canonical profile
  -> in parallel:
       next-question call(updated profile + latest Q/A)
       local ranking(updated profile)
```

Structured components carry hidden semantic metadata (`topic`, `proposition`,
`stance`, `importance`, and `voteLane`) on their options/statements, so their
answers need no stance-extraction AI call. This merge happens before selecting
the next question.

For chat/freetext, extract and validate the stance delta before asking for the
next question. This creates a strict state boundary: next-question generation
and ranking consume the same complete profile version and can run in parallel.
The extraction call is deliberately small and returns only a delta. A combined
`stanceDelta + next question` call may later be benchmarked as a latency
optimization, but must not become the default unless it matches the strict
pipeline on correction, contradiction, and redundant-question evaluations.

The next-question prompt receives only:

- the complete compact set of active preferences;
- unresolved conflicts and low-confidence preferences;
- topic and vote-lane coverage;
- the latest question and answer verbatim; and
- ranking uncertainty or the topics most likely to discriminate candidates,
  when available.

It does not receive the full UI component history, full transcript, full
candidate records, or raw evidence corpus. Full transcript data remains stored
for display and audit.

### Preference extraction and merge rules

- Ignore seat/electorate selection as a political preference.
- Structured answers map deterministically from component metadata.
- Free text may produce zero, one, or multiple atomic preferences.
- Preserve qualifiers such as strength, trade-offs, and vote lane.
- Clamp and validate all numeric fields and canonical topic/proposition ids.
- Never infer a stance merely because a topic was mentioned.
- Reject an invalid delta without mutating the existing profile. Record the raw
  answer as pending extraction and retry or ask a clarification; do not silently
  generate a normal follow-up from state known to be stale.
- Hash the active profile so unchanged preferences reuse ranking results.

Component mappings are explicit:

- `dropdown`: apply only the selected option's declared preference effects;
  unselected options imply nothing.
- `multiselect`: apply declared effects for selected options only. Selection
  may establish importance, but never support/opposition unless metadata says
  so; unselected options imply nothing.
- `yesno`: each statement declares a proposition and its agree stance.
  `agree` applies that stance, `disagree` negates it, and `skip` adds nothing.
- `slider`: metadata declares whether the scale measures stance or importance
  and its neutral point. Normalize linearly to `[-1, 1]` for stance or `[0, 1]`
  for importance, clamped at the configured endpoints.
- `priority`: for `n` ranked items at zero-based index `i`, set importance to
  `1 - i / n`; unranked items imply nothing.
- `chat`/`freetext` and any supplemental text: send the verbatim question and
  text through stance extraction. Merge those effects in addition to any
  deterministic structured effects from the same response.

Semantic metadata uses a `preferenceEffects[]` shape rather than hard-coding
politics into UI components. Each effect includes taxonomy version, topic,
proposition, stance/importance operation, and vote lane.

Only active, resolved preferences with `abs(stance) >= 0.1` participate in
ranking, evidence coverage, margins, or ranking-confidence topic coverage.
Explicit neutral preferences count as answered for conversation planning but
do not discriminate candidates. Unresolved preferences neither score nor count
as covered and should be prioritized for clarification.

### Proposition taxonomy

The taxonomy is versioned configuration owned by
`src/lib/config/preference-taxonomy.ts` and referenced by election config.
Stable ids use `common/<topic>/<proposition>` for reusable claims and
`election/<electionId>/<topic>/<proposition>` for election-specific extensions.
IDs are immutable within a version. A version bump supplies an explicit map
from every prior id to a new id or `null`; profile and evidence migrations use
the same map. Server actions reject mixed taxonomy versions rather than
silently comparing unlike claims. The initial taxonomy contains the configured
election topics and every proposition emitted by question metadata or evidence
normalization; adding a proposition requires a config change and fixtures.

### Normalized evidence claims

Deterministic scoring requires evidence to use the same versioned proposition
taxonomy as voter preferences:

```ts
interface EvidenceClaim {
  schemaVersion: string;
  taxonomyVersion: string;
  id: string;
  subjectType: "candidate" | "party";
  subjectId: string;
  topic: string;
  proposition: string;
  stance: number; // -1..1
  classifierConfidence: number; // 0..1
  sourceQuality: number; // 0..1
  evidenceId: string;
  evidenceText: string;
  spanStart?: number;
  spanEnd?: number;
  publishedAt?: string;
  independenceKey: string;
  classifier: { kind: "rules" | "local-nli" | "ai"; version: string };
}
```

`independenceKey` groups copies of the same speech, press release, policy, or
party line so duplicates cannot add weight. Claims are generated and reviewed
offline, stored canonically in SQLite, and embedded only as a derived index.
The claim schema is owned here; source acquisition remains in spec 010.

### Local evidence retrieval

Look up evidence by active preference, not by candidate:

1. Query the indexed SQLite claim table by taxonomy version + proposition/topic
   + all eligible candidate/party ids. This exhaustive lookup is the primary
   scoring input and cannot starve a sparse candidate behind a prolific one.
2. For preferences not mapped to a canonical proposition, run one focused
   vector query across the eligible pool, combine dense and lexical relevance,
   and locally rerank the results for clarification and cited display. These
   fallback results cannot affect scores; they remain pending until normalized
   and persisted as versioned canonical claims. Absence from global top-k is
   never recorded as no evidence.
3. Group claims by `candidateId` and `partyId`, preserving their source spans.
4. Cache by `(preferenceHash, candidatePoolHash, corpusVersion)` and recompute
   only affected preference contributions.

Vector similarity supplies relevance only. It must never directly become the
candidate compatibility score. Candidate and party claims are normalized
offline to the same topic/proposition/stance vocabulary when evidence is
ingested, amortizing classification cost across all voter sessions. Vector RAG
continues to retrieve source passages for explanations and citations.
Fallback retrieval uses a separate, non-scoring `EvidenceRetrievalConfig`; its
thresholds and dense/lexical weights cannot enter `AlignmentScoringConfig`.

### Deterministic scoring

Version all constants in `AlignmentScoringConfig`. Initial `v1` uses two
independent claims per preference, candidate versus party weights `0.70/0.30`
for the electorate lane, and party-only evidence for the party-vote lane.
Missing candidate evidence is not replaced by extra party weight.

For preference `p` and claim `q`:

```text
w(p) = p.importance * p.confidence
agreement(p,q) = clamp((1 + p.stance * q.stance) / 2, 0, 1)
signal(p,q) = q.classifierConfidence * q.sourceQuality * recency
```

Only exact, same-taxonomy canonical proposition claims reach this formula.
Initial recency is `max(0.5, 0.5 ** (ageYears / 4))`, or `1` when no date
exists. Source-quality weights are versioned by source type: official
voting/Hansard `1.0`, official party/candidate policy or manifesto `0.9`,
attributable secondary reporting `0.7`, and unknown/social `0.5`.

For each preference and subject, retain the strongest two distinct
`independenceKey` claims. Let `coverage = max(signal)` and `knownAgreement` be
their signal-weighted mean agreement. The evidence-adjusted preference score
is `0.5 + coverage * (knownAgreement - 0.5)`: unknown evidence stays at the
neutral baseline rather than becoming agreement or opposition.

Blend candidate and party adjusted scores as configured, without renormalizing
away missing evidence. The final lane score is the `w(p)`-weighted mean across
applicable preferences, multiplied by 100 and rounded. If there are no
applicable preferences, return no score rather than displaying a synthetic 50.
Weighted evidence coverage is `sum(w(p) * coverage) / sum(w(p))`.

Return both compatibility and coverage:

```ts
interface LocalAlignmentScore {
  score: number; // 0..100 compatibility over supported preferences
  coverage: number; // 0..1 weighted preferences with usable evidence
  confidence: number; // ranking stability/evidence sufficiency
  contributions: PreferenceContribution[];
}
```

No evidence is `unknown`, not disagreement. Low coverage reduces confidence
and is visible to the user. Ranking confidence should use score margins,
weighted topic coverage, evidence coverage, and sensitivity to uncertain
preferences rather than interaction count alone.

Initial ranking confidence is
`round(100 * (0.40 * evidenceCoverage + 0.30 * topicCoverage + 0.30 * marginStability))`,
where `marginStability = clamp((topScore - secondScore) / 20, 0, 1)` and topic
coverage is importance-weighted. Sort by score, then evidence coverage, then
stable candidate/party id. All constants live in the versioned config and
golden fixtures lock `v1` behavior.

### Minimal AI boundary

Runtime AI is allowed for:

- a small structured stance-extraction call for free-text answers before the
  next-turn call;
- proposing pending classifications for ambiguous retrieved claims, which do
  not affect scores until persisted as versioned canonical claims; and
- cited explanations for the top few or user-expanded results.

Runtime AI does not assign final numerical rankings or directly contribute an
unpersisted claim to them. Structured candidate and party evidence extraction
may use AI offline during ingestion because it is performed once per corpus
revision, versioned, reviewable, and cached.

### Failure and latency behavior

- A failed free-text stance extraction preserves the latest raw answer as
  pending, leaves the profile unchanged, and must not erase prior preferences.
  Retry once, then ask a neutral clarification rather than advancing from stale
  state.
- A failed vector query retains the previous ranking and marks it stale.
- A candidate with no evidence remains visible with low coverage.
- After stance merge, ranking and next-question generation run independently;
  the next question should not wait for vector retrieval or explanations.
- Stale ranking results are discarded using profile version/hash, extending
  the current sequence guard.

## Plan

- [ ] Add the compatibility fix and regression coverage so the current ranker
      always receives the visible question with every answer before the larger
      profile migration lands.
- [ ] Add the versioned proposition taxonomy plus Zod-validated extraction,
      canonical profile, and local score types with response-only migration.
- [ ] Add semantic metadata to structured components and deterministic
      response-to-delta mapping; exclude seat selection.
- [ ] Add a small structured stance-extraction action for free text, then build
      the next-turn prompt from the validated updated profile plus latest
      verbatim Q/A.
- [ ] Implement provenance-preserving profile merge, conflict/supersession
      rules, idempotency/version checks, profile hashing, migration, and failure
      fallbacks.
- [ ] Add the versioned normalized evidence-claim schema and coordinate its
      offline population with spec 010.
- [ ] Replace per-candidate retrieval with exhaustive proposition claim lookup,
      plus cached per-preference vector fallback and grouped candidate/party
      evidence contributions.
- [ ] Implement deterministic lane-aware scoring, coverage, confidence, and
      source-backed templated explanations; remove the holistic ranking LLM
      call after parity evaluation.
- [ ] Add offline evidence-claim normalization to spec 010's ingestion path;
      keep the current ranker behind a feature flag until canonical claims pass
      coverage evaluation rather than scoring unnormalized runtime output.
- [ ] Instrument latency, query count, cache hit rate, token use, ranking
      stability, and evidence coverage; compare against the existing ranking on
      a fixed evaluation set before switching the default.

## Test

- [ ] Current-profile regression: dropdown, multiselect, priority, yes/no,
      slider, chat, and freetext responses all preserve visible question plus
      answer; two identical answer strings to different questions remain
      distinguishable.
- [ ] Structured answers update the profile without an AI call before the next
      question is generated.
- [ ] A free-text delta is validated and merged before next-question generation;
      both ranking and next-question calls receive the same profile hash/version.
- [ ] Invalid free-text deltas do not mutate prior state and lead to one retry,
      then a neutral clarification with the answer retained as pending.
- [ ] Explicit corrections supersede old preferences while preserving response
      provenance; ambiguous contradictions remain unresolved.
- [ ] Extraction output cannot set canonical ids, provenance, status, or
      arbitrary superseded preference ids; the merge layer assigns them.
- [ ] Explicit neutral and unresolved preferences do not affect scores,
      evidence coverage, margins, or ranking-confidence topic coverage.
- [ ] Mixed taxonomy versions are rejected, and the declared migration map
      migrates both voter preferences and evidence claims consistently.
- [ ] Seat selection never creates a political preference.
- [ ] Retrieval query count scales with changed preferences, not candidates,
      and repeated party evidence is deduplicated.
- [ ] Local scoring distinguishes supporting, opposing, and merely topical
      evidence; missing evidence lowers coverage rather than compatibility.
- [ ] Candidate and party-vote lanes remain independent and deterministic.
- [ ] Profile/version changes invalidate stale ranking results and unchanged
      profiles hit the cache.
- [ ] Duplicate submissions are idempotent; out-of-order versions are rejected;
      reset/reload and response-only session migration preserve consistent state.
- [ ] An evidence-rich candidate cannot starve a sparse candidate's canonical
      proposition claims, and global vector top-k absence is never treated as
      proof that the sparse candidate has no evidence.
- [ ] Golden fixtures lock the exact v1 component mappings, agreement formula,
      source/recency weights, coverage, lane blend, confidence, and tie-breaks.
- [ ] Mock-mode tests make no paid AI or embedding calls and return stable
      scores with cited contribution details.
- [ ] Evaluation fixtures cover negation, trade-offs, corrections, uneven
      evidence volume, duplicated sources, sparse candidates, and ties.

## Notes

### Alternatives considered

1. **Combined free-text extraction + next-question call:** reduces serial
   latency, but the next question is not based on a separately validated and
   committed profile. Keep it as a possible optimization after evaluation,
   rather than the default.
2. **Update stance asynchronously after asking the next question:** lowest
   immediate latency, but the question is selected from stale state and may be
   redundant. Rejected.
3. **Embed one running prose summary:** cheap, but blends topics, loses
   importance and contradictions, and cannot distinguish agreement from
   opposition. It may remain a weak supplemental retrieval signal only.

## Architecture review — 2026-07-10

> **Review status:** direction approved; changes requested before implementation.
> These are review findings, not yet accepted design decisions. Resolve them in
> the normative sections above before implementing the affected phase.

The core direction is sound: structured voter preferences, offline normalized
claims, exhaustive SQL lookup, non-scoring vector fallback, deterministic
lane-aware scoring, explicit evidence coverage, and a narrow runtime-AI boundary
are materially better than the current prose-summary, vector-relevance, and LLM
ranking pipeline. The early visible-question compatibility fix can proceed
independently. The larger design needs the following contracts clarified.

### High-priority findings

#### 1. Generated semantic metadata is not trusted deterministic input

The LLM currently generates component wording and options. Adding structurally
validated `preferenceEffects[]` to that output does not prove that the declared
proposition matches the visible wording, that polarity is correct, or that a
priority is actually a stance. It moves semantic classification to question
generation rather than eliminating it. Client-submitted metadata can also be
stale or modified.

Prefer server-owned registered question definitions and immutable effect ids.
The LLM may select a registered `questionDefinitionId`, but may not invent
scoring effects. The server must look up effects and validate submitted option
ids against that definition. Dynamically worded or unregistered questions must
be non-scoring or have their answers pass through validated extraction.

#### 2. State authority and atomic persistence are unclear

The current server actions are stateless, so they cannot authoritatively reject
a stale profile version without a server-side session store. Current browser
state also spans independent local-storage keys, so adding
`session:voterProfile` beside `session:steps` cannot make them one atomic
snapshot.

For a local-first design, persist one schema-versioned `SessionSnapshot`
containing responses, accepted effects/deltas, extraction state, selected race,
profile projection, and profile version. Apply turns through one pure reducer.
The server returns validated output tagged with `baseProfileVersion`; the client
applies it only if its version still matches. Ranking is disposable derived
state tagged with all input versions. Do not describe this as a server commit.
If cross-device or tamper-resistant authority is required, introduce a durable
server session store as a separate architectural decision.

Persist accepted effects/deltas with each response and treat `VoterProfile` as
a cached fold. This preserves auditability and permits deterministic repair
without rerunning historic free-text extraction. Define cross-tab behavior and
use stable UUIDs rather than timestamp-derived response/question identities.

#### 3. Canonical candidate identity must be resolved

`EvidenceClaim.subjectType: "candidate"` is ambiguous in the current model.
Evidence may belong to a candidacy in one race, a person across elections, or a
party. Existing `evidence_sources.candidate_id` is deliberately a soft reference
across legacy candidate and generic person/candidacy identities.

Define the eligible electorate subject explicitly with `electionId`, `raceId`,
`candidacyId`, `personId`, and optional `partyId`. Assign campaign-specific
claims to the candidacy, historical speeches/votes to the person, and policies
or manifestos to the party. The electorate scorer resolves candidacy, person,
and optionally party claims; the party lane uses party claims only. Do not carry
legacy hashed numeric candidate ids across the scoring boundary.

#### 4. Preference types do not represent every required state

Canonical `VoterPreference.stance` is numeric while extracted stance may be
null, yet unresolved, importance-only, and unmapped signals are all described.
Repeated answers may also create multiple active records and double-weight one
proposition. Interaction between `both` and later lane-specific refinements is
undefined.

Represent canonical resolved positions, canonical unresolved/importance-only
signals, and unmapped clarification signals without dummy stance values. Define
a unique active key such as `(taxonomyVersion, propositionId, voteLane)` and
permit at most one active aggregate per key while retaining multiple provenance
responses. Specify confirmation, changed importance, contradiction, correction,
retraction, and `both` versus lane-specific overlap. Prefer merge operations
such as `upsert`/`retract` against canonical keys; never let extraction select
arbitrary preference ids to supersede.

#### 5. Unknown evidence can otherwise become the displayed winner

With neutral shrinkage, a subject with no evidence scores 50 while a subject
with credible mild disagreement may score 47. Sorting by score first would rank
the unknown subject above the evidenced one, despite compatibility being
described as applying to supported preferences.

Add `ranked | insufficient-evidence` status and a versioned minimum usable
coverage threshold. Subjects below it remain visible but have no displayed
compatibility rank, sort after scoreable subjects, and cannot become the shown
winner. Define behavior when fewer than two subjects qualify. Keep per-subject
compatibility/coverage separate from lane-level ranking confidence and return a
`LaneRankingResult` with lane, profile hash, corpus revision, scoring-config
version, ranking confidence, and subject results.

#### 6. Claims need a publication and invalidation lifecycle

Claims must be linked to the exact source revision they classify. Otherwise an
updated `evidence_sources` row can leave stale claims active, and a partially
rebuilt corpus can mix revisions at runtime.

The durable claim model needs an evidence-source foreign key, source content
hash/revision, normalization run and corpus revision, classifier/normalizer
version, timestamps, deterministic uniqueness/indexes, verified span bounds,
and `proposed | accepted | rejected | superseded` status. Source changes must
invalidate prior claims. Build and validate a complete corpus revision, then
publish it atomically; only accepted claims from the active revision may score.
Derive `independenceKey` deterministically from source lineage rather than
accepting arbitrary classifier output.

### Additional concerns

#### Privacy and logging

Political preferences are sensitive even without a user name. Document what
stays local, what profile/free-text content is sent to OpenAI, Anthropic, or
OpenRouter, retention and reset behavior, prompt-safe omission of session and
provenance ids, production log redaction, and user disclosure. Local embeddings
do not imply local chat inference. Do not silently batch-send old sessions to
an external model on page load; require an explicit migration action or keep
them on the legacy path until reset.

#### Formula definitions and calibration

Treat all v1 constants as hypotheses to calibrate, not established weights.
Clamp future dates and recency to valid ranges; avoid treating an unknown date
as maximally fresh without evidence. Separate source authenticity from
evidentiary directness—Hansard proves that words were spoken, not necessarily a
durable policy position. Define an exhaustive source-type quality mapping,
deterministic ties for the strongest claims, temporal change and contradictory
claim behavior, and use unrounded scores for margins. Include scoring-config
version and active corpus revision in every result/cache key. Define exactly
whose evidence coverage contributes to lane confidence and either add the
promised uncertain-preference sensitivity term or remove that claim.

#### Component behavior

The current priority component begins with every option ranked, so “unranked
items imply nothing” is not achievable and an untouched default order could be
mistaken for user importance. Require explicit interaction or a selectable
ranked subset. Test partial success where trusted structured effects apply but
supplemental free-text extraction fails: deterministic effects remain and the
text stays pending.

#### Prompt ownership and compatibility formatting

Name one owner for the strict extraction, merge, and next-question transition;
do not independently add profile behavior to both `AIChatHandler` and the
legacy `PromptManager` path. Introduce one shared question-and-answer formatter
using `question || questionId` and apply it to current candidate ranking, party
ranking, and preference-summary paths before the larger migration.

#### Evaluation and rollout

Parity with the current LLM ranker is diagnostic, not ground truth. Add
human-reviewed evaluation sets for free-text proposition/stance/lane extraction,
claim polarity and source-span validity, duplicate independence, score
invariants, no-evidence behavior, and hand-labelled lane rankings. Define
precision, coverage, stability, latency, and cost thresholds before switching.
Shadow metrics must not log raw profiles.

### Recommended decomposition

Keep this spec as an umbrella and split implementation into three independently
rollable children:

1. **Structured profile and strict turn pipeline:** shared compatibility
   formatter, registered question definitions, one session snapshot, pure
   profile reducer, free-text extraction, and compact next-question context.
   This work does not depend on spec 010 and should relate to spec 020.
2. **Normalized evidence claims and corpus publication:** canonical
   candidacy/person/party identity, claim schema and statuses, normalization,
   review, invalidation, and atomic corpus revisions. This child depends on
   spec 010.
3. **Deterministic scorer, evaluation, and rollout:** separate lane results,
   insufficient-evidence behavior, coverage/confidence formulas, explanations,
   shadow evaluation, and feature-flagged rollout. This depends on both prior
   children.

Avoid building a general migration framework for every future taxonomy version
before a second version exists. For v1, prefer a new schema-versioned session
namespace with an explicit reset or narrowly defined one-time migration.

### Minimal safe implementation sequence

1. **Compatibility fix:** shared visible-question/answer formatting and
   regression tests across every component type.
2. **Trust and identity contracts:** finalize registered-question semantics and
   canonical candidacy/person/party ids before adding schemas.
3. **Shadow profile:** implement the single session snapshot, pure reducer,
   persisted accepted deltas, hashes, and mock fixtures without changing live
   ranking or next-question behavior.
4. **Strict turn pipeline:** map registered structured answers, extract free
   text, commit the accepted delta, and generate the next question from the
   resulting profile. Keep the old ranker active for independent evaluation.
5. **Reviewed claim corpus:** add revisioned claim storage and publish a small,
   hand-reviewed corpus before broad automated normalization.
6. **Shadow scorer:** run the pure party/electorate scorer against human-labelled
   fixtures and production-shaped aggregate metrics without exposing scores.
7. **Guarded rollout:** expose coverage and insufficient-evidence states first,
   then feature-flag score ordering independently per lane. Retain the old
   ranker only as rollback, not as a mixed fallback within one result list.
