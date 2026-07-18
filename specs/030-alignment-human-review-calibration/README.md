---
status: planned
created: 2026-07-18
priority: medium
tags:
- ranking
- evaluation
- scoring
depends_on:
- 029-ranking-ui-direct-cutover
parent: 025-deterministic-alignment-scoring-rollout
created_at: 2026-07-18T23:54:27.697284937Z
updated_at: 2026-07-18T23:54:27.697341949Z
---
# Review and calibrate deterministic alignment results

> **Status**: planned · **Priority**: medium

## Goal

Use a small human-reviewed Auckland Central evaluation set to find unreasonable extraction, evidence-classification, aggregation, coverage, and explanation behavior, then adjust only the versioned constants or contracts justified by those examples.

## Architecture

Evaluation is an offline/local development tool, not a rollout gate. Fixtures contain synthetic voter claims plus cited public corpus passage IDs and reviewer labels. A deterministic script reports category, lane, ordering, coverage, and citation disagreements without storing real user sessions.

## Plan

- [ ] Define `tests/evaluation/fixtures/auckland-central-alignment.json` and a strict schema for synthetic claims, expected relationship categories, expected lane ordering/bands, and reviewer notes.
- [ ] Include support, opposition, negation, trade-offs, corrections, conflicting statements, duplicate lineage, sparse evidence, ties, and candidate/party disagreement.
- [ ] Add `scripts/evaluate-alignment.ts` to run the canonical 028 boundary and print a compact deterministic mismatch report.
- [ ] Have at least two review passes label the fixtures independently; record disagreements explicitly rather than silently choosing one label.
- [ ] Separate extraction/classification failures from scoring-formula failures before changing constants.
- [ ] Change only versioned config in `src/lib/scoring/alignment.ts` (or a dedicated config module) when the reviewed examples justify it; update golden fixtures in the same change.
- [ ] Add regression fixtures for every accepted correction.
- [ ] Document the chosen evidence bounds, coverage threshold, source/recency treatment, combined-weight cap, and presentation bands in Spec 025.
- [ ] Commit with `jj` after the evaluation harness, reviewed labels, and each coherent calibration change.

## Test and verification

- Run `bun run scripts/evaluate-alignment.ts`; expected result is a deterministic report with no unreviewed fixture shape errors.
- Run the evaluator twice and compare output exactly.
- Run `bun run test tests/unit/alignment-scoring.test.ts tests/unit/deterministic-live-ranking.test.ts` after each calibration.
- Run the full test, typecheck, lint, and build suite before completion.

## Done when

The Auckland Central fixture set has recorded human review, every accepted scoring correction has a regression case, versioned constants are documented, and remaining disagreements are explicit rather than hidden by arbitrary tuning.

## Non-goals

- Matching the deleted holistic LLM ranker.
- Collecting real voter sessions.
- Treating initial thresholds as permanent scientific truth.
