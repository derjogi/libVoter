---
status: complete
created: 2026-06-22
priority: high
tags:
- hansard
- data
- schema
- ingestion
parent: '010'
created_at: 2026-06-22T05:43:26.633084982Z
updated_at: 2026-06-22T08:36:24.776692699Z
completed_at: 2026-06-22T08:36:24.776692699Z
transitions:
- status: in-progress
  at: 2026-06-22T08:20:06.305886675Z
- status: complete
  at: 2026-06-22T08:36:24.776692699Z
---

# Hansard corpus storage model

## Overview

Make official Hansard documents durable evidence even when they are not yet associated with a candidate or party. The current ingestion runner rejects every normalized source that does not resolve to an existing identity, which would discard most of the 54th Parliament while NZ 2026 candidacies remain unknown.

## Design

Treat the document as the primary record. Extend evidence_sources with a stable source document key and Hansard metadata such as document kind, publication status, and Parliament number. Candidate and party fields remain available for older adapters, but both may be null for corpus documents.

The stable key is the official Hansard document ID, scoped by adapter. It—not the current URL or content hash—identifies draft, corrected, and final versions of the same document. Content hashes still detect unchanged fetches.

This spec covers storage and runner behavior only. People, parties, and their roles are handled by spec 013.

## Plan

- [x] Add stable external document identity and Hansard metadata to evidence_sources.
- [x] Update the evidence store to find and update a row by adapter plus external document ID.
- [x] Let explicitly corpus-capable adapters persist sources without candidateId or partyId.
- [x] Preserve the current unmatched-report behavior for adapters that still require identity ownership.
- [x] Generate and apply the Drizzle migration.

## Test

- [x] A corpus source with no candidate or party is inserted successfully.
- [x] A corrected version updates the same row rather than creating a duplicate.
- [x] Existing Auckland and party-policy unmatched behavior remains unchanged.
- [x] Schema and ingestion unit tests pass.

## Notes

This is the foundation for specs 012–015. It deliberately does not parse Hansard or create participant relationships.

### Implementation decisions (22 June 2026)

- Added sourceAdapter, externalId, documentType, sourceStatus, and parliamentNumber as nullable document metadata.
- Added a unique sourceAdapter + externalId index in migration 0006.
- SourceAdapter.requiresIdentity defaults to required; corpus adapters must explicitly set it false.
- Stable external identity takes precedence over URL and content hash. Status-only revisions update metadata, while distinct external IDs remain distinct even when their text matches.
- Focused ingestion and schema tests pass. Repository-wide verification remains separately blocked by the existing ComponentRenderer.tsx parse error and unrelated Biome debt.
