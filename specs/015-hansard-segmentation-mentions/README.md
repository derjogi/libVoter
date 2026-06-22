---
status: planned
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
updated_at: 2026-06-22T05:43:26.933223177Z
---
# Hansard utterance segmentation and mention enrichment

## Overview

Improve retrieval precision after the base corpus is safely stored. Split multi-speaker documents into ordered turns and optionally identify people discussed in the text without confusing discussion with authorship.

## Design

Create ordered utterance segments that retain document context, speaker when known, sequence, and text. RAG chunks may group neighbouring turns so questions and answers remain understandable.

Add mentioned-person relationships only as a separate relation from participation. Begin with deterministic matching against known Parliament people. Any probabilistic or model-assisted extraction must store method and confidence and remain reviewable.

This work is deliberately deferred: the corpus, participant roles, and backfill are useful without it.

## Plan

- [ ] Define ordered utterance storage and its relationship to evidence documents.
- [ ] Parse speaker-labelled turns from representative speeches and oral questions.
- [ ] Define a distinct mentioned-person relation with provenance and confidence.
- [ ] Implement conservative deterministic mention matching.
- [ ] Feed context-preserving utterance chunks into spec 009 retrieval.
- [ ] Evaluate false associations before enabling mention-based candidate evidence.

## Test

- [ ] Speaker turns preserve source order and reconstruct the cleaned document.
- [ ] Question and answer chunks retain enough neighbouring context to make sense.
- [ ] A person named in prose is marked mentioned, never speaker.
- [ ] Ambiguous names remain unresolved rather than guessed.
- [ ] Retrieval metadata exposes document, speaker, role, date, and canonical URL.

## Notes

This is low priority and should not block ingesting the official corpus.