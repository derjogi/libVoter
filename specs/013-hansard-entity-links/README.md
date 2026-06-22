---
status: planned
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
updated_at: 2026-06-22T05:43:26.785453054Z
---
# Hansard participant and party relationships

## Overview

Associate one Hansard document with every person and party that actually participates in it, without pretending that the document belongs to one candidate. Keep contribution roles distinct from mere textual mentions.

## Design

Add many-to-many document relationships for people and parties. Person roles initially cover speaker, questioner, answerer, chair, and participant. Party vote relationships record aye, no, abstain, or unknown where the official record supplies that information.

Parliamentarians are people independently of candidacy. A current MP may therefore exist in people without a candidacies row. If that person later contests NZ 2026, adding the candidacy exposes the existing Hansard history without rewriting evidence.

Use official metadata and transcript speaker labels for participant extraction. A name appearing inside prose is not participation and must not be added as a speaker relationship. Mention extraction is deferred to spec 015.

## Plan

- [ ] Add document-person and document-party relationship tables with role or stance metadata.
- [ ] Add a Parliament-person resolver that can create or match MPs without creating candidacies.
- [ ] Extract participant roles from official metadata and transcript labels.
- [ ] Parse party-level and named individual vote information conservatively.
- [ ] Report unresolved or ambiguous participant names.

## Test

- [ ] One oral question links questioner, answerer, and chair with different roles.
- [ ] One speech links multiple actual contributors without linking people only mentioned in prose.
- [ ] A party vote links every recorded party to its stated side.
- [ ] Creating Hansard people does not create NZ 2026 candidacies.
- [ ] Reingestion is idempotent for all relationships.

## Notes

Party votes express a recorded party position, not necessarily a personal vote by every member. The UI and later RAG prompts must preserve that distinction.