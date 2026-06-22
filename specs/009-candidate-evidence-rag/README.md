---
status: planned
created: 2026-06-15
priority: high
tags:
- ai
- rag
- architecture
- schema
depends_on:
- '002'
- '003'
created_at: 2026-06-15T10:47:57.996599283Z
updated_at: 2026-06-15T10:49:29.286304523Z
transitions:
- status: in-progress
  at: 2026-06-15T10:49:04.324300082Z
- status: planned
  at: 2026-06-15T10:49:12.488277554Z
---

# Evidence-retrieval RAG: electorate-scoped candidate + party evidence with citations

> **Status**: planned · **Priority**: high · **Created**: 2026-06-15

## Overview

Supersedes the RAG approach in spec **005**. Spec 005 used the vector
store (`RAGQueryEngine`) to *find which candidates* match the user by
running a global similarity search across all candidate records. That is
the wrong job for RAG and is currently dead code: it is never called from
[`chat-handler.ts`](../../src/lib/server/ai/chat-handler.ts), and the
Chroma `candidates` collection is empty, so the right-hand panel never
shows anything.

This spec reframes RAG for the project's **longer-term goal**:

- Widen from Auckland 2025 → NZ 2026 (national) → potentially other large
  countries (e.g. US). Many thousands of candidates total.
- Per candidate, ingest **a lot more evidence**: voting records,
  parliamentary statements (Hansard), public statements, possibly social
  media — plus their **party's** policy positions and actions.
- Show the user, per shortlisted candidate, **both** the individual track
  record **and** the party line, as source-cited summaries that expand to
  the original text and/or link out to the source.

### Key insight: two separable problems

1. **Which candidates?** (selection / ranking). Even at national/US
   scale, the user only ever ranks **one electorate's** pool — a handful
   to a few dozen people. This is a structured DB filter, **not** RAG.
2. **What does this candidate (and their party) believe / do?**
   (evidence + grounded summaries). This is an unbounded corpus per
   candidate — hundreds of pages. **This is what RAG is for.**

So: keep and **repurpose** the vector layer as an *evidence-retrieval +
citation* index, scoped by a structured electorate pre-filter. Do **not**
use it to pick candidates.

## Design

### Two-stage retrieval ("search only your electorate's sub-selection")

```
electorate ─▶ SQL filter ─▶ candidateIds + partyIds (small set)
                                   │
user priorities ─▶ embed ─▶ vector search  WHERE candidate_id ∈ ids
                                                OR party_id ∈ ids
                                   │
                       relevant chunks (with source_url, type, date)
                                   │
              ┌────────────────────┴────────────────────┐
       individual track record                     party line
       (per-candidate summary)                 (per-party summary)
```

Stage 1 is plain SQL over the existing `candidates` / `races` /
`candidacies` / `parties` tables (specs 002/003). Stage 2 searches the
vector store **with a metadata filter** restricting to that electorate's
candidates and their parties — never the whole national corpus.

### Vector schema: index document *chunks*, not candidates

The current store indexes one document per candidate. Change it to index
**source-document chunks**, each carrying metadata that powers filtering,
the track-record-vs-party split, and citations:

```ts
interface EvidenceChunkMeta {
  candidate_id?: string;   // present for candidate-specific evidence
  party_id?: string;       // present for party-level evidence
  source_type: "voting_record" | "hansard" | "statement"
             | "social" | "manifesto" | "party_policy";
  source_url: string;      // for "link out to source"
  source_title?: string;
  date?: string;           // ISO; enables recency weighting / display
  election_id: string;     // scope to active election
  // chunk text stored as the document body (for in-app expand)
}
```

Storing the original chunk text + `source_url` is what makes summaries
**expandable** (show full passage in-app) and **linkable** (out to the
origin), per the product goal.

### Summaries (gated, cheap)

- Retrieve relevant chunks for each **shortlisted** candidate (those past
  a match threshold — see spec 005's gating idea), split by
  `candidate_id` chunks vs their `party_id` chunks.
- One summarization LLM call per shortlisted candidate for the individual
  summary, and one per party (cached/deduped across candidates sharing a
  party). Not a per-turn global LLM-JSON blob like today's
  `queryWithContext`.
- Each summary cites the chunks it used (`source_title` + `source_url`),
  so the UI can render summary → expand passage → open source.

### Ingestion: offline / batch, not live

Scrape → clean → chunk → embed → upsert during **DB build**, plus a
**background refresher** on the server (cron/queue). Per-request scraping
is too slow and flaky. Local HuggingFace embeddings
(`createEmbeddingModel`) keep ingestion free at scale. Extend
`scripts/scrape-candidates.ts` and the vector populate path to attach the
metadata above; associate each source with a `candidate_id` and/or
`party_id`.

### Infra at scale (decision deferred, flagged)

- Chroma-in-Docker is fine to prototype the chunk/metadata-filter model.
- At multi-country scale (millions of chunks) with a structured
  pre-filter + vector join, strongly prefer **pgvector** (co-locate
  vectors with the relational candidate/party data — one source of truth,
  one join) or a managed store (Qdrant / Turbopuffer). Keep the vector
  access behind `vector-store.ts` so the backend can be swapped.

### Bugs in existing code to fix when reusing it

- **Distance vs similarity inversion**: Chroma's
  `similaritySearchWithScore` returns a **distance** (lower = closer),
  but [`vector-store.ts`](../../src/lib/server/rag/vector-store.ts) /
  [`query-engine.ts`](../../src/lib/server/rag/query-engine.ts) treat it
  as similarity (higher = better) and sort descending — rankings are
  inverted. Normalize to a real similarity before ranking.
- `RAGQueryEngine` is wired to the hard-coded `small` model and does an
  unnecessary per-query LLM JSON pass; drop that for the retrieval path.

## Plan

> Big spec — implement incrementally. Phase 1 is independent of RAG and
> unblocks the empty sidebar immediately.

- [x] **Phase 1 (no RAG):** map the already-loaded `availableCandidates`
      (ward + mayor) into the right panel on seat selection in
      [`page.tsx`](../../src/app/page.tsx) so candidates are visible
      instantly. (Also covers spec 005's "always-visible panel".)
      Done via `toUnrankedMatches()` in
      [`src/lib/client/candidate-match.ts`](../../src/lib/client/candidate-match.ts);
      shown with neutral score until ranking lands in Phase 5. Guarded the
      post-answer `setCandidates` so the handler's empty `candidateMatches`
      array no longer clobbers the seeded list.
- [x] **Phase 2 — data model:** add an evidence/source table (or chunk
      metadata) associating sources to `candidate_id` / `party_id` with
      `source_type`, `source_url`, `date`. Reuse parties from spec 002.
      Done: `evidenceSources` table + `SOURCE_TYPES`/`SourceType` in
      [`schema.ts`](../../src/lib/db/schema.ts) (canonical full-text store of
      scraped sources; chunks/embeddings are derived into the vector store in
      Phase 4). Migration `drizzle/0005_evidence_sources.sql` generated and
      applied. `candidate_id`/`party_id` are soft references (indexed) during
      the spec-002 migration; harden to FKs once the generic model is the
      single source of truth.
- [ ] **Phase 3 — ingestion:** **extracted to its own spec —
      [010-scrape-sources](../010-scrape-sources/README.md)** (too large to
      inline). Extend the scraper + a background refresher to fetch voting
      records / statements / manifestos / party policy into
      `evidenceSources`, then chunk + embed (handed to Phase 4).
- [x] **Phase 4 — retrieval:** rewrite `vector-store.ts` to index chunks
      and accept a metadata filter (`candidateIds` / `partyIds`);
      rewrite `query-engine.ts` to take that filter instead of a global
      search + LLM JSON pass. Fix the distance/similarity bug. Done:
      `scripts/embed-evidence.ts` chunks and embeds the canonical
      `evidenceSources` rows, and filtered retrieval returns cited candidate
      and party evidence with distance normalized to similarity.
      `--repopulate` is collection-idempotent: it deletes only Chroma's
      derived `evidence` collection via `deleteCollection`, discards the stale
      LangChain collection handle, then rebuilds the index once.
- [~] **Phase 5 — ranking + confidence:** rank the electorate pool from
      retrieved-evidence relevance; derive confidence from top-vs-second
      margin + topic/evidence coverage (carries over spec 005's formula).
      **Interim done (no evidence retrieval yet):** `rankCandidates()` +
      `generateRanking()` in
      [`chat-handler.ts`](../../src/lib/server/ai/chat-handler.ts) score the
      whole ward pool in one structured LLM call per turn (fine for ≤~40
      candidates) using existing DB fields; `deriveConfidence()` implements
      the margin + topic-coverage formula. Mock fixture
      `MOCK_CANDIDATE_RANKING` added. **Still pending:** rank from retrieved
      evidence (needs Phases 2–4) instead of raw DB fields.
- [ ] **Phase 6 — gated summaries + UI:** for shortlisted candidates,
      generate individual + party summaries with citations; render
      expandable, source-linked cards (individual track record vs party
      line). Re-enable the stubbed summary in
      [`RightPanel.tsx`](../../src/components/layout/RightPanel.tsx).

## Test

- [ ] Stage-1 filter returns only the selected electorate's candidates +
      their parties; vector search never returns out-of-electorate
      chunks.
- [ ] A retrieved chunk round-trips its `source_url` / `source_type` so
      the UI can expand the passage and link out.
- [ ] Individual vs party evidence are separable for the same candidate.
- [ ] Distance→similarity fix: the closest chunk ranks first (regression
      test for the inversion bug).
- [ ] Summaries are only generated for candidates past the match
      threshold; below-threshold candidates show no LLM-generated text.
- [ ] Mock mode (spec 006) drives retrieval + summaries deterministically
      end-to-end.

## Notes

- **Relationship to 005:** this spec **supersedes the RAG / candidate-
  ranking design** in 005. The UI concerns in 005 (always-visible panel,
  "keep asking" / "I'm ready to decide" buttons, margin-based confidence)
  remain valid and are folded into Phases 1, 5, 6 here.
- Open question: store full source text in-app vs link-out only — likely
  both (store chunk text for expand, keep `source_url` for attribution
  and full context).
- Open question: party-line summary caching key — per `(party_id,
  user_profile_hash)` so candidates sharing a party reuse it.
- Resist over-building ingestion before the retrieval + UI shape is
  proven on a small, hand-seeded evidence set.

## Dependencies

- **Depends on**: spec 002 (parties / races schema), spec 003
  (electorate support) for the structured pre-filter.
- **Supersedes / extends**: spec 005 (RAG ranking design).
- **Benefits from**: spec 004 (Zod-validated outputs), spec 006 (mock
  mode for deterministic tests).
