---
status: planned
created: 2026-06-22
priority: high
tags:
- hansard
- data
- schema
- ingestion
parent: '010'
created_at: 2026-06-22T05:43:26.633084982Z
updated_at: 2026-06-22T05:43:26.633200876Z
---
# Hansard corpus storage model

## Overview

Make official Hansard documents durable evidence even when they are not yet associated with a candidate or party. The current ingestion runner rejects every normalized source that does not resolve to an existing identity, which would discard most of the 54th Parliament while NZ 2026 candidacies remain unknown.

## Design

Treat the document as the primary record. Extend evidence_sources with a stable source document key and Hansard metadata such as document kind, publication status, and Parliament number. Candidate and party fields remain available for older adapters, but both may be null for corpus documents.

The stable key is the official Hansard document ID, scoped by adapter. It—not the current URL or content hash—identifies draft, corrected, and final versions of the same document. Content hashes still detect unchanged fetches.

This spec covers storage and runner behavior only. People, parties, and their roles are handled by spec 013.

## Plan

- [ ] Add stable external document identity and Hansard metadata to evidence_sources.
- [ ] Update the evidence store to find and update a row by adapter plus external document ID.
- [ ] Let explicitly corpus-capable adapters persist sources without candidateId or partyId.
- [ ] Preserve the current unmatched-report behavior for adapters that still require identity ownership.
- [ ] Generate and apply the Drizzle migration.

## Test

- [ ] A corpus source with no candidate or party is inserted successfully.
- [ ] A corrected version updates the same row rather than creating a duplicate.
- [ ] Existing Auckland and party-policy unmatched behavior remains unchanged.
- [ ] Schema and ingestion unit tests pass.

## Notes

This is the foundation for specs 012–015. It deliberately does not parse Hansard or create participant relationships.