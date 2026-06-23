---
status: complete
created: 2026-06-22
priority: high
tags:
- hansard
- identity
- data
depends_on:
- '012'
parent: '010'
created_at: 2026-06-22T05:43:26.785360681Z
updated_at: 2026-06-23T10:30:12.984077876Z
completed_at: 2026-06-23T10:30:12.984077876Z
transitions:
- status: in-progress
  at: 2026-06-23T07:39:32.548051426Z
- status: complete
  at: 2026-06-23T10:30:12.984077876Z
---

# Hansard participant and party relationships

## Overview

Associate one Hansard document with every person and party that actually participates in it, without pretending that the document belongs to one candidate. Keep contribution roles distinct from mere textual mentions.

## Design

Add many-to-many document relationships for people and parties. Person roles initially cover speaker, questioner, answerer, chair, and participant. Party vote relationships record aye, no, abstain, or unknown where the official record supplies that information.

Parliamentarians are people independently of candidacy. A current MP may therefore exist in people without a candidacies row. If that person later contests NZ 2026, adding the candidacy exposes the existing Hansard history without rewriting evidence.

Use official metadata and transcript speaker labels for participant extraction. A name appearing inside prose is not participation and must not be added as a speaker relationship. Mention extraction is deferred to spec 015.

## Plan

- [x] Add document-person and document-party relationship tables with role or stance metadata.
- [x] Add a Parliament-person resolver that can create or match MPs without creating candidacies.
- [x] Extract participant roles from official metadata and transcript labels.
- [x] Parse party-level vote information conservatively.
- [x] Decide whether named individual vote stances need first-class person-vote metadata or can wait for a later vote-specific spec. Decision: wait for a later vote-specific spec; current party-vote rows intentionally express party position only.
- [x] Report unresolved or ambiguous participant names if later source enrichment stops creating Hansard people directly. Current ingestion still creates Hansard people from official metadata/transcript labels; ambiguous prose names are handled in spec 015 mentions and left unresolved rather than guessed.

## Test

- [x] One oral question links questioner, answerer, and chair with different roles.
- [x] One speech links actual contributors without linking people only mentioned in prose.
- [x] A party vote links every recorded party to its stated side.
- [x] Creating Hansard people does not create NZ 2026 candidacies.
- [x] Reingestion is idempotent for all relationships.

## Notes

Party votes express a recorded party position, not necessarily a personal vote by every member. The UI and later RAG prompts must preserve that distinction.

Implemented in migration `0007_mean_cardiac`: Hansard documents now retain separate document-person and document-party relationship rows. The ingestion runner replaces relationships idempotently on insert/update/unchanged reingestion, creates Parliament people independently of candidacies, and keeps prose mentions out of participant extraction. Mention extraction remains deferred to spec 015.