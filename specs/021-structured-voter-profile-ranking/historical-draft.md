## Design

> **Historical draft warning:** Sections below this notice predate the accepted
> direction above. Fixed proposition taxonomies, trusted generated semantic
> metadata, exact-proposition lookup, and response-history migration are not
> approved implementation instructions. Child specs must replace these sections;
> only non-conflicting constraints remain informative.

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

Persist one browser-authoritative, schema-versioned `SessionSnapshot` containing
the transcript, extracted claims/deltas, selected race, profile projection, and
profile version. A delta carries `sessionId`, `responseId`, and
`baseProfileVersion`. Applying it is idempotent: ignore an already-applied
response id, reject a stale base version in the client reducer, and increment
the version once per accepted response. Reset clears the snapshot and derived
ranking caches together. On reload, hydrate the snapshot before accepting a new
answer. Server actions remain stateless validators and do not persist political
preferences.

No legacy-session migration is required: the application has not been used
outside testing environments. Introducing the snapshot starts a new storage
namespace and discards the existing split-key test sessions without sending old
responses for extraction or adding migration UI.

### Turn ordering

Every submitted response is first committed to the local transcript with a
stable response id. Conversation planning and durable claim extraction then
branch in parallel:

```text
submitted answer -> persist response in SessionSnapshot
                 |-> next-question call
                 |     (accepted earlier claims + latest raw Q/A
                 |      + compact asked-question/topic coverage)
                 |
                 `-> claim-extraction call(exact visible Q/A + base version)
                       -> validate and apply/queue claim revision
                       -> retrieve/classify changed claims in background
                       -> refresh derived ranking and progress
```

The next-question call may interpret the latest raw answer conversationally but
cannot commit canonical claims or scoring metadata. Therefore it knows enough to
ask a relevant follow-up without putting unvalidated interpretation into durable
ranking state. If extraction later identifies an unresolved compound statement
or possible correction, that state can guide a clarification on a subsequent
turn; it does not interrupt or replace the question already shown.

Extraction results carry their response id and base snapshot/profile version.
The reducer applies them in response order, queues a result whose predecessor is
still pending, and discards or retries results that no longer match the claim
revision they were based on. Ranking is disposable derived state and runs only
from accepted claims, never directly from an unvalidated extraction result.

The next-question prompt receives only:

- the compact set of claims accepted before the latest response;
- unresolved conflicts and pending clarification signals already accepted;
- compact asked-question and topic coverage needed to avoid repetition;
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
