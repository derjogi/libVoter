---
status: complete
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
updated_at: 2026-06-22T09:15:24.980263938Z
completed_at: 2026-06-22T09:15:24.980263938Z
transitions:
- status: in-progress
  at: 2026-06-22T08:53:06.645425364Z
- status: complete
  at: 2026-06-22T09:15:24.980263938Z
---

# Hansard document discovery and ingestion adapter

## Overview

Discover and ingest the official Hansard record for the 54th Parliament, beginning in December 2023. Preserve speeches, oral questions, votes, and other substantive events without waiting for NZ 2026 candidate identities.

## Design

Add a hansard SourceAdapter with injectable discovery and fetch functions. Discovery selects Parliament 54 documents and supports the shared limit and since controls. Normalize individual document pages rather than full-day Daily transcripts, because Daily pages duplicate their component documents.

Map speeches, questions, and substantive events to hansard. Map vote documents to voting_record. Store the official document ID, title, sitting date, publication status, canonical URL, clean text, and available metadata.

The newly migrated Hansard site is client rendered and protected by a browser challenge. Implementation must identify a respectful public discovery surface from official Parliament pages, indexes, feeds, or exports; it must not bypass access controls. Network behavior remains isolated behind injectable functions so fixture tests stay deterministic.

## Plan

- [x] Confirm the supported official discovery surface and record the request contract.
- [x] Add representative fixtures for speech, oral-question, vote, and event documents.
- [x] Implement discovery for Parliament 54 with limit and since filtering.
- [x] Implement robots-aware, rate-limited fetch and clean normalization.
- [x] Register the hansard adapter in the ingestion CLI.
- [x] Document attribution, source status, and operational usage.

## Test

- [x] Discovery excludes combined Daily transcripts and documents outside Parliament 54.
- [x] Each representative document type normalizes to the expected source type and metadata.
- [x] Draft and final documents retain the same stable document identity.
- [x] Robots denial and empty or malformed documents are safely skipped or reported.
- [x] Adapter tests make no live network calls.

## Notes

Official Hansard is the near-verbatim record of debate. Publication status matters because documents move from draft through corrected to final.

Implementation decisions (2026-06-22): Parliament's own client uses POST /api/data/search with DebateItem + Speech/Question/Vote filters, then GET /api/resources/transcript/YYYY-MM-DD. Search GUIDs map to hyphen-free data-id anchors in daily HTML; the adapter caches that HTML per sitting date and extracts only the requested section. Daily and Debate aggregate records are excluded. Procedural/substantive contributions exposed by the API use the Speech subtype. Candidate/participant association is intentionally deferred to spec 013. Direct server requests encountered Parliament's browser-verification layer during research; the adapter reports non-JSON responses and does not bypass it. A final one-record CLI dry-run was attempted but the execution environment declined elevated network access, so verification remains fixture-based. Focused verification: 27 tests pass, TypeScript passes, and scoped Biome passes. The full suite still has the pre-existing ComponentRenderer.tsx JSX/Vite parse failure; 96 other tests pass.
