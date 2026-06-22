---
status: planned
created: 2026-06-22
priority: high
tags:
- hansard
- scraping
- ingestion
- adapter
depends_on:
- '011'
parent: '010'
created_at: 2026-06-22T05:43:26.708957713Z
updated_at: 2026-06-22T05:43:26.709167666Z
---
# Hansard document discovery and ingestion adapter

## Overview

Discover and ingest the official Hansard record for the 54th Parliament, beginning in December 2023. Preserve speeches, oral questions, votes, and other substantive events without waiting for NZ 2026 candidate identities.

## Design

Add a hansard SourceAdapter with injectable discovery and fetch functions. Discovery selects Parliament 54 documents and supports the shared limit and since controls. Normalize individual document pages rather than full-day Daily transcripts, because Daily pages duplicate their component documents.

Map speeches, questions, and substantive events to hansard. Map vote documents to voting_record. Store the official document ID, title, sitting date, publication status, canonical URL, clean text, and available metadata.

The newly migrated Hansard site is client rendered and protected by a browser challenge. Implementation must identify a respectful public discovery surface from official Parliament pages, indexes, feeds, or exports; it must not bypass access controls. Network behavior remains isolated behind injectable functions so fixture tests stay deterministic.

## Plan

- [ ] Confirm the supported official discovery surface and record the request contract.
- [ ] Add representative fixtures for speech, oral-question, vote, and event documents.
- [ ] Implement discovery for Parliament 54 with limit and since filtering.
- [ ] Implement robots-aware, rate-limited fetch and clean normalization.
- [ ] Register the hansard adapter in the ingestion CLI.
- [ ] Document attribution, source status, and operational usage.

## Test

- [ ] Discovery excludes combined Daily transcripts and documents outside Parliament 54.
- [ ] Each representative document type normalizes to the expected source type and metadata.
- [ ] Draft and final documents retain the same stable document identity.
- [ ] Robots denial and empty or malformed documents are safely skipped or reported.
- [ ] Adapter tests make no live network calls.

## Notes

Official Hansard is the near-verbatim record of debate. Publication status matters because documents move from draft through corrected to final.