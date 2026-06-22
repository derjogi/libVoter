# Hansard Offline Cache Design

## Context

The `nz-hansard` adapter cannot acquire live data with plain Bun `fetch`.
Both the search API and public Hansard index return a Radware loader to direct
HTTP clients. A normal browser session reaches the application after roughly
ten seconds, after which the client search and transcript endpoints return
JSON. Browser diagnosis also found that the search contract now expects a
DateOnly value such as `2023-12-05`; the previous ISO timestamp is rejected.

Parliament 54 currently contains roughly 36,775 eligible transcript sections.
Database ingestion must therefore not depend on one uninterrupted live
browser session.

## Architecture

Add a separate `fetch:hansard` acquisition command. It uses the installed
`agent-browser` CLI to open the public Hansard application, waits until normal
browser verification completes, and performs the same-origin requests used by
the Parliament client. Verification cookies remain inside the browser; the
command never exports or replays them.

The command writes a versioned local cache under `data/hansard-cache/`:

- paginated document metadata for Parliament 54;
- one gzip-compressed HTML transcript per sitting date; and
- an atomic manifest recording the cache format, term boundary, completed
  work, failures, and completeness.

The existing adapter remains responsible for filtering, section extraction,
normalization, and stable-ID upsert. When `--hansard-cache` is supplied, its
discovery and fetch stages read local files instead of making network calls.
Incomplete or incompatible caches are rejected unless an explicit sample mode
is selected.

## Acquisition flow

1. Validate `agent-browser` availability and cache configuration.
2. Open Hansard and poll until the real application replaces the Radware
   loader, failing clearly after 30 seconds.
3. Request search pages with `YYYY-MM-DD` dates and conservative pacing.
4. Atomically persist validated metadata and update the manifest.
5. Derive unique sitting dates and fetch each daily transcript once.
6. Gzip and atomically persist each validated transcript.
7. Mark the cache complete only when all expected pages and dates succeeded.
8. Close the browser in a `finally` path.

On rerun, valid completed files are skipped. A refresh option re-fetches
metadata and selected transcripts so draft, corrected, and final revisions can
replace older cached material.

## Failure handling

- A missing browser CLI, verification timeout, non-JSON response, schema
  mismatch, or corrupt gzip file reports the exact page or sitting date.
- Temporary files are renamed only after validation, so interrupted writes
  never masquerade as completed work.
- Failed items remain retryable in the manifest; successful work is retained.
- Offline ingestion refuses an incomplete cache by default.
- No challenge tokens, cookies, custom bot-evasion headers, or proxy behavior
  are persisted or copied into the application.

## Testing

Automated tests remain fully offline. Fixtures cover manifest compatibility,
DateOnly requests, resume behavior, atomic writes, gzip loading, corrupt and
incomplete caches, section extraction, normalization, and idempotent ingestion.
A separately invoked smoke run limits acquisition to one search page and one
sitting date before the full backfill begins.

## Spec relationship

This work is tracked by spec 016, depends on the document adapter in spec 012,
and is a prerequisite for the operational full-term backfill in spec 014.
