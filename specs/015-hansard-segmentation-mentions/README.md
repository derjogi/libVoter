---
status: complete
created: 2026-06-22
priority: low
tags:
- hansard
- rag
- enrichment
- nlp
depends_on:
- '013'
parent: '010'
created_at: 2026-06-22T05:43:26.933068164Z
updated_at: 2026-06-23T10:30:13.038201246Z
completed_at: 2026-06-23T10:30:13.038201246Z
transitions:
- status: in-progress
  at: 2026-06-23T08:14:19.226478472Z
- status: complete
  at: 2026-06-23T10:30:13.038201246Z
---

# Hansard utterance segmentation and mention enrichment

## Overview

Improve retrieval precision after the base corpus is safely stored. Split multi-speaker documents into ordered turns and optionally identify people discussed in the text without confusing discussion with authorship.

## Design

Create ordered utterance segments that retain document context, speaker when known, sequence, and text. RAG chunks may group neighbouring turns so questions and answers remain understandable.

Add mentioned-person relationships only as a separate relation from participation. Begin with deterministic matching against known Parliament people. Any probabilistic or model-assisted extraction must store method and confidence and remain reviewable.

This work is deliberately deferred: the corpus, participant roles, and backfill are useful without it.

## Plan

- [x] Define ordered utterance storage and its relationship to evidence documents.
- [x] Parse speaker-labelled turns from representative speeches and oral questions.
- [x] Define a distinct mentioned-person relation with provenance and confidence.
- [x] Implement conservative deterministic mention matching.
- [x] Feed context-preserving utterance chunks into spec 009 retrieval.
- [x] Evaluate false associations before enabling mention-based candidate evidence. Initial enablement is conservative: exact full-name matching only, ambiguous known-name matches are skipped, and mentioned-person rows are stored separately from participant rows.

## Test

- [x] Speaker turns preserve source order and reconstruct the cleaned document.
- [x] Question and answer chunks retain enough neighbouring context to make sense.
- [x] A person named in prose is marked mentioned, never speaker.
- [x] Ambiguous names remain unresolved rather than guessed.
- [x] Retrieval metadata exposes document, speaker, role, date, and canonical URL.

## Notes

Implemented in migration `0008_mean_toro`: Hansard documents now have ordered utterance rows (`hansard_utterances`) and separate mentioned-person rows (`hansard_mentions`) with method/confidence/provenance. The NZ Hansard adapter segments `<strong>Speaker:</strong>` turns, appends unlabeled continuation paragraphs to the current turn, performs conservative deterministic full-name mention matching against known people, and skips ambiguous known names. Vector indexing now prefers utterance-level documents with previous/current/next turn context and exposes document type, speaker, role, date, canonical URL, evidence id, and utterance sequence in retrieved chunks.