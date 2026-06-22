# Hansard Offline Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acquire Parliament 54 Hansard data through one normally verified browser session and ingest it deterministically from a resumable local cache.

**Architecture:** A browser-only acquisition layer writes validated search pages, gzip-compressed daily transcripts, and an atomic versioned manifest. The existing Hansard adapter receives file-backed `search` and `transcript` functions, preserving its discovery, section extraction, normalization, and stable-ID behavior while removing live HTTP from database ingestion.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, Node `zlib`, `agent-browser`, LeanSpec

---

### Task 1: Correct and validate the Hansard wire contract

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `tests/unit/hansard-adapter.test.ts`

- [ ] **Step 1: Change the existing request-contract test to expect DateOnly**

Update both discovery assertions from ISO timestamps to:

```ts
expect(requests[0]).toMatchObject({
  dateFrom: "2024-01-01",
});
expect(search).toHaveBeenCalledWith(
  expect.objectContaining({ dateFrom: "2023-12-05" }),
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test tests/unit/hansard-adapter.test.ts`

Expected: FAIL because `searchRequest()` still sends `toISOString()`.

- [ ] **Step 3: Use a DateOnly request type and formatter**

Change `HansardSearchRequest.dateFrom` to a documented `YYYY-MM-DD` string and add:

```ts
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
```

Use `toDateOnly(from)` in `searchRequest()`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test tests/unit/hansard-adapter.test.ts`

Expected: all Hansard adapter tests pass.

- [ ] **Step 5: Inspect the scoped diff**

Run: `jj diff -- src/lib/server/ingestion/adapters/hansard.ts tests/unit/hansard-adapter.test.ts`

Expected: only the DateOnly contract and corresponding tests changed.

### Task 2: Add the versioned cache model and atomic storage

**Files:**
- Create: `src/lib/server/ingestion/hansard/cache.ts`
- Create: `tests/unit/hansard-cache.test.ts`

- [ ] **Step 1: Write failing manifest and round-trip tests**

Cover:

```ts
const manifest = createManifest({ since: "2023-12-05", pageSize: 100 });
expect(manifest).toMatchObject({
  version: 1,
  parliamentNumber: 54,
  complete: false,
  completedPages: [],
  completedDates: [],
});

await writeSearchPage(cacheDir, 1, searchResponse);
expect(await readSearchPage(cacheDir, 1)).toEqual(searchResponse);

await writeTranscript(cacheDir, "2024-01-02", transcriptHtml);
expect(await readTranscript(cacheDir, "2024-01-02")).toBe(transcriptHtml);
```

Also assert that an incompatible manifest, missing page, corrupt JSON, and
corrupt gzip return errors containing the cache path and page/date.

- [ ] **Step 2: Run the cache test and verify RED**

Run: `bun run test tests/unit/hansard-cache.test.ts`

Expected: FAIL because the cache module does not exist.

- [ ] **Step 3: Implement schemas and paths**

Use Zod schemas for this minimal format:

```ts
interface HansardCacheManifest {
  version: 1;
  parliamentNumber: 54;
  since: string;
  pageSize: number;
  totalDocuments?: number;
  completedPages: number[];
  completedDates: string[];
  failures: Array<{
    kind: "search" | "transcript";
    key: string;
    message: string;
  }>;
  complete: boolean;
  updatedAt: string;
}
```

Use `search/page-000001.json`, `transcripts/YYYY-MM-DD.html.gz`, and
`manifest.json`. Validate every read.

- [ ] **Step 4: Implement atomic JSON and gzip writes**

Write a unique sibling temporary file, validate/close it, then use `rename()`.
Clean up the temporary file on failure. Never write directly to a final path.

- [ ] **Step 5: Run cache tests and verify GREEN**

Run: `bun run test tests/unit/hansard-cache.test.ts`

Expected: manifest, atomic page, transcript, and corruption tests pass.

### Task 3: Wrap the installed agent-browser CLI

**Files:**
- Create: `src/lib/server/ingestion/hansard/agent-browser.ts`
- Create: `tests/unit/hansard-browser.test.ts`

- [ ] **Step 1: Write failing tests with an injected command runner**

Define a runner boundary:

```ts
export type BrowserCommandRunner = (
  args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
```

Test that `HansardBrowserClient.start()`:

- checks the CLI version;
- opens only `https://hansard.parliament.nz`;
- polls title until it differs from `Radware Page`;
- times out with a clear verification error; and
- always targets a unique `lib-voter-hansard-*` session.

Test JSON output parsing independently with captured `agent-browser --json`
shapes. Do not launch a browser in unit tests.

- [ ] **Step 2: Run browser-client tests and verify RED**

Run: `bun run test tests/unit/hansard-browser.test.ts`

Expected: FAIL because the browser client does not exist.

- [ ] **Step 3: Implement safe CLI execution**

Use `Bun.spawn()` with an argument array, never a shell string. Capture stdout
without a fixed 1 MB buffer limit because transcripts can exceed 2 MB. Reject
non-zero exit codes with bounded stderr. Do not expose cookie/storage commands.

- [ ] **Step 4: Implement same-origin JSON evaluation**

Expose only:

```ts
interface HansardBrowser {
  start(): Promise<void>;
  search(request: HansardSearchRequest): Promise<HansardSearchResponse>;
  transcript(date: string): Promise<string>;
  close(): Promise<void>;
}
```

The generated page scripts call relative `/api/...` URLs, check status and
content type, and return JSON. Validate the returned shape at the caller.

- [ ] **Step 5: Run browser-client tests and verify GREEN**

Run: `bun run test tests/unit/hansard-browser.test.ts`

Expected: command, verification, parsing, and cleanup tests pass offline.

### Task 4: Implement resumable acquisition

**Files:**
- Create: `src/lib/server/ingestion/hansard/acquire.ts`
- Create: `tests/unit/hansard-acquisition.test.ts`
- Use: `tests/unit/fixtures/hansard-search-sample.json`
- Use: `tests/unit/fixtures/hansard-transcript-sample.html`

- [ ] **Step 1: Write failing acquisition tests with a fake browser**

Cover:

- pages are fetched until `@odata.count` is exhausted;
- completed valid pages and dates are skipped on rerun;
- each unique sitting date is fetched once;
- `limitPages` and `limitDates` create an explicitly partial sample cache;
- a failed page/date is recorded and retried later;
- `refresh` re-fetches otherwise valid work; and
- `browser.close()` runs on success and failure.

- [ ] **Step 2: Run acquisition tests and verify RED**

Run: `bun run test tests/unit/hansard-acquisition.test.ts`

Expected: FAIL because `acquireHansardCorpus()` does not exist.

- [ ] **Step 3: Implement the metadata phase**

Use page size 100 and the Parliament 54 term boundary. After each validated
page, atomically write it and the updated manifest. Use an injectable sleep
function and default conservative interval. Keep partial work when a later
page fails.

- [ ] **Step 4: Implement the transcript phase**

Derive sorted unique dates from cached metadata, fetch each daily transcript
once, gzip it atomically, and checkpoint the manifest after every date.

- [ ] **Step 5: Implement completeness and resume rules**

Set `complete: true` only when all expected pages and dates exist and no
failure remains. Limited runs stay incomplete and include sample metadata.

- [ ] **Step 6: Run acquisition tests and verify GREEN**

Run: `bun run test tests/unit/hansard-acquisition.test.ts`

Expected: all resume, failure, refresh, limit, and cleanup tests pass.

### Task 5: Make the existing adapter read the cache

**Files:**
- Modify: `src/lib/server/ingestion/adapters/hansard.ts`
- Modify: `src/lib/server/ingestion/adapters/index.ts`
- Create: `tests/unit/hansard-cache-adapter.test.ts`

- [ ] **Step 1: Write failing file-backed adapter tests**

Build a temporary cache from existing fixtures, then assert:

```ts
const adapter = new NzHansardAdapter({ cacheDir });
const refs = await adapter.discover(context({ limit: 2 }));
const raw = await adapter.fetch(refs[0], context());
```

Verify local reads require no robots/network calls, gzip text extracts the
correct section, incomplete caches fail by default, and `allowPartialCache`
permits a bounded sample.

- [ ] **Step 2: Run adapter-cache tests and verify RED**

Run: `bun run test tests/unit/hansard-cache-adapter.test.ts`

Expected: FAIL because `cacheDir` is not an adapter option.

- [ ] **Step 3: Add the cache transport**

Extend `HansardAdapterOptions` with:

```ts
cacheDir?: string;
allowPartialCache?: boolean;
```

When configured, create file-backed search/transcript functions. Keep injected
functions for unit tests. Cache mode bypasses robots and network rate limiting
because all reads are local; live mode retains existing guards.

- [ ] **Step 4: Add registry options without changing other adapters**

Add an optional registry configuration object carrying only Hansard cache
settings and pass it to `NzHansardAdapter`.

- [ ] **Step 5: Run all Hansard and ingestion tests**

Run:

```bash
bun run test tests/unit/hansard-adapter.test.ts \
  tests/unit/hansard-cache.test.ts \
  tests/unit/hansard-cache-adapter.test.ts \
  tests/unit/ingestion.test.ts
```

Expected: all focused tests pass without live network calls.

### Task 6: Add operational CLIs and documentation

**Files:**
- Create: `scripts/fetch-hansard.ts`
- Modify carefully: `scripts/ingest-sources.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `docs/SETUP.md`
- Modify through LeanSpec CLI: `specs/016-hansard-offline-cache/README.md`

- [ ] **Step 1: Add argument-parser tests or extract pure parsing functions**

Cover `--cache`, `--since`, `--limit-pages`, `--limit-dates`, `--refresh`,
`--min-interval-ms`, `--hansard-cache`, and `--allow-partial-cache`. Reject
invalid numbers/dates before browser or database work begins.

- [ ] **Step 2: Add `fetch:hansard`**

The script constructs the browser client, calls `acquireHansardCorpus()`, logs
page/date progress and a final resume summary, and sets a non-zero exit code
when failures remain.

- [ ] **Step 3: Wire offline ingestion without overwriting user edits**

Preserve the current `nz-2026` default and any concurrent changes in
`scripts/ingest-sources.ts`. Pass `--hansard-cache` and
`--allow-partial-cache` to registry options. If Hansard is selected without a
cache, print a direct instruction to run `bun run fetch:hansard` rather than
attempting the known-blocked direct API.

- [ ] **Step 4: Ignore only the generated cache directory**

Add `/data/hansard-cache/` to `.gitignore`; do not ignore other data fixtures.

- [ ] **Step 5: Document sample, resume, full acquisition, and ingestion**

Document:

```bash
bun run fetch:hansard --limit-pages 1 --limit-dates 1
bun run ingest:sources --source nz-hansard \
  --hansard-cache data/hansard-cache --allow-partial-cache --dry-run
bun run fetch:hansard
bun run ingest:sources --source nz-hansard \
  --hansard-cache data/hansard-cache
```

Explain disk usage uncertainty, gzip storage, resume/refresh, and that browser
verification stays within `agent-browser`.

- [ ] **Step 6: Run focused tests and static checks**

Run:

```bash
bun run test tests/unit/hansard-adapter.test.ts \
  tests/unit/hansard-cache.test.ts \
  tests/unit/hansard-browser.test.ts \
  tests/unit/hansard-acquisition.test.ts \
  tests/unit/hansard-cache-adapter.test.ts \
  tests/unit/ingestion.test.ts
bunx tsc --noEmit
bunx biome check <all changed TypeScript and JSON files>
git diff --check
lean-spec validate
```

Expected: focused tests and all scoped static checks pass.

### Task 7: Run a bounded live smoke test and finish spec 016

**Files:**
- Update through LeanSpec CLI: `specs/016-hansard-offline-cache/README.md`
- Potentially update: `docs/SETUP.md`

- [ ] **Step 1: Run a one-page/one-date acquisition**

Run:

```bash
bun run fetch:hansard --cache /tmp/lib-voter-hansard-smoke \
  --limit-pages 1 --limit-dates 1 --min-interval-ms 0
```

Expected: browser verification completes normally; one search page and one
gzip transcript are written; manifest is explicitly partial.

- [ ] **Step 2: Run offline dry-run ingestion from the sample**

Run:

```bash
bun run ingest:sources --source nz-hansard --election nz-2026 \
  --hansard-cache /tmp/lib-voter-hansard-smoke \
  --allow-partial-cache --limit 5 --dry-run
```

Expected: up to five normalized records, no live Parliament requests during
ingestion, and no WAF error.

- [ ] **Step 3: Re-run acquisition to prove resume behavior**

Run the same acquisition command again.

Expected: completed page/date are skipped and no duplicate file is created.

- [ ] **Step 4: Perform final verification**

Run focused tests, TypeScript, scoped Biome, Drizzle check, LeanSpec validate,
and `git diff --check` fresh. Run the full test suite and distinguish any
pre-existing failures from scoped failures.

- [ ] **Step 5: Record measured smoke results and complete the spec**

Use `lean-spec update` to check acceptance items, append counts/runtime/cache
size and any limitations, then mark 016 complete only if every scoped gate and
the live smoke test pass.
