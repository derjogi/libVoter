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