# Setup & Run

## Prerequisites

- **Bun** (the project uses `bun` everywhere; npm/pnpm should also work but
  the lockfile is `bun.lock` and `dev`/`build` scripts assume bun is on PATH).
- **Docker + docker compose** — for the Chroma vector DB.
- **Linux/macOS** preferred (Playwright headed Chromium for scraping).
- An LLM provider key — at minimum one of:
  - `OPENROUTER_API_KEY` (recommended; the project's default & cheapest path
    via models like `openrouter/openai/gpt-5-nano`).
  - `OPENAI_API_KEY` for direct OpenAI use.
  - `ANTHROPIC_API_KEY` for Claude.
- **No OpenAI embeddings key required** — embeddings run locally via
  `@huggingface/transformers` (downloads a model on first run, ~100 MB,
  cached under `~/.cache/huggingface`).

## Quick start (using the bundled data)

The repo already contains a populated `voting-advisor.db` (Auckland 2025
candidates). You do **not** need to scrape to run the app.

```bash
# 1. Install deps
bun install

# 2. Create env file
bun run setup-env setup        # writes .env.local skeleton
$EDITOR .env.local             # set OPENROUTER_API_KEY (or OPENAI_…)

# 3. Start Chroma in the background
docker compose up -d chroma
#   verifies on http://localhost:8000/api/v1/heartbeat

# 4. Run the app (also starts chroma via `bun run chroma` background)
bun run dev
#   → http://localhost:3000
```

Recommended `.env.local` for low-cost dev (any OpenRouter model works):

```env
OPENROUTER_API_KEY=sk-or-...
AI_MODEL_SMALL=openrouter/openai/gpt-5-nano
AI_MODEL_LARGE=openrouter/openai/gpt-5-mini
AI_MODEL_REASONING=openrouter/openai/gpt-5

DATABASE_URL=file:./voting-advisor.db
CHROMA_URL=http://localhost:8000

AI_CONFIDENCE_THRESHOLD=50
AI_MAX_TOKENS=64000
AI_TEMPERATURE=0.7
MIN_INTERACTIONS_BEFORE_RESULTS=3

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=devsecret
NODE_ENV=development
```

`AI_MODEL_*` strings are parsed by `src/lib/server/ai/config.ts`:
`<provider>/<model>` where provider ∈ {openai, anthropic, openrouter}. If the
prefix isn't recognised the whole string is treated as an OpenRouter model id.

## What runs the first time you hit the app

1. `getUniqueWards()` reads from libSQL → populates the ward dropdown.
2. The first chat-or-component request constructs `VectorStoreManager`,
   which downloads the HuggingFace embedding model (one-time, large) and then
   queries Chroma.
3. The evidence collection is built offline with
   `bun run scripts/embed-evidence.ts` (or `--repopulate`), not as part of the
   chat request path.
4. Subsequent requests reuse the Chroma collection (persisted under
   `./data/chroma/` because of the docker-compose volume mount).

## Re-scraping candidates (only when election data changes)

The scraper is currently mostly commented-out in `scripts/scrape-candidates.ts`
— `main()` only triggers `getVectorStoreManager()`. To actually re-scrape:

1. Uncomment the block in `main()` (the `args` / `scrapeCandidates(...)` lines).
2. Make sure Chroma is up.
3. Run:
   ```bash
   bun run scrape:candidates
   # optional flags from inside main():  --start=<n> --limit=<m>
   ```
4. The scraper writes both into `data/all-candidates.json` and upserts into
   `voting-advisor.db`. If the evidence corpus changed, rebuild Chroma
   separately with `bun run scripts/embed-evidence.ts --repopulate`.

> ⚠️ Scraping uses **headed** Chromium (`headless: false`). On a headless CI
> machine you'll need to flip that or run under Xvfb.

## Ingesting evidence sources

The shared evidence ETL writes normalized source documents to
`evidence_sources`. Parliament requires normal browser verification, so
Hansard acquisition and database ingestion are separate, resumable steps.

First acquire a bounded smoke-test cache using the globally installed
`agent-browser` CLI:

```bash
bun run fetch:hansard --limit-pages 1 --limit-dates 1

bun run ingest:sources --source nz-hansard --election nz-2026 \
  --hansard-cache data/hansard-cache --allow-partial-cache \
  --limit 20 --dry-run
```

For the complete term, rerun acquisition without limits. It checkpoints every
search page and sitting date, so an interrupted run resumes automatically:

```bash
bun run fetch:hansard
bun run ingest:sources --source nz-hansard --election nz-2026 \
  --hansard-cache data/hansard-cache
```

Use `--refresh` with `fetch:hansard` to reacquire cached draft/corrected
material. Transcripts are stored once per sitting date as gzip files under the
gitignored `data/hansard-cache/`; final disk usage should be measured before a
full cache is distributed. Remove `--dry-run` to persist evidence.

Acquisition parameters define the cache layout and must match its manifest
when resuming. Ingestion does not redefine that layout: `--limit` and
`--since` only filter the records already available in the cache. A newer
`--since` selects a smaller date range. If `--since` predates the cache,
ingestion warns and starts at the manifest's earliest available date. An
incomplete cache still requires `--allow-partial-cache`.

The adapter selects individual `Speech`, `Question`, and `Vote` sections,
excluding combined Daily transcripts. Speeches and questions become
`hansard`; votes become `voting_record`. Records retain Parliament's stable
section ID, publication status (`draft`, `corrected`, or `final`), sitting
date, speaker when supplied, and a canonical Parliament URL. They are stored
without candidate association; participant linking is a later enrichment.

The official client uses `POST /api/data/search` for discovery and
`GET /api/resources/transcript/YYYY-MM-DD` for transcript HTML. API calls stay
inside the normally verified browser page; verification cookies are never
exported or replayed. Offline ingestion performs no Parliament requests.
Canonical URLs and the `New Zealand Parliament` fallback author preserve
source attribution.

## Database

- Default: local SQLite file `./voting-advisor.db`.
- Migrations live in `drizzle/` (`0000_…` → `0003_…`).
- Drizzle commands:
  ```bash
  bunx drizzle-kit generate     # write a new migration based on schema.ts
  bunx drizzle-kit migrate      # apply pending migrations
  ```
  There is a programmatic wrapper in `src/lib/server/migrations.ts`.
- Optional: point `DATABASE_URL` at a Turso libSQL URL and supply
  `DATABASE_AUTH_TOKEN`.

## Useful scripts

| Command                              | Effect                                              |
| ------------------------------------ | --------------------------------------------------- |
| `bun run dev`                        | start chroma in bg + Next dev server (Turbopack)    |
| `bun run build` / `bun run start`    | production build / serve                            |
| `bun run lint` / `bun run format`    | Biome check / write                                 |
| `bun run chroma`                     | `docker compose up -d chroma` (creates if missing)  |
| `bun run setup-env [setup|validate]` | env scaffolding / validation                        |
| `bun run validate-env`               | run `setup-env validate`                            |
| `bun run scrape:candidates`          | Playwright scraper (see above)                      |
| `bun run ingest:sources --source nz-hansard --election nz-2026` | ingest the Parliament 54 Hansard corpus |
| `bun run fetch:hansard`                | acquire/resume the local Parliament 54 Hansard cache |
| `bun run test:election-config`       | sanity-check the election config                    |
| `bunx playwright test test-chat-flow.spec.ts` | run the E2E spec (currently hits real LLMs) |

## Known issues you'll hit immediately

1. **Chat past the first question fails.**
   `AIChatHandler.processMessage` (`src/lib/server/ai/chat-handler.ts`)
   references `messages` and `candidates` that were commented out (around
   lines 55–80). The first ward dropdown works because it bypasses this and
   calls `selectNextComponent` directly. Repair plan:
   - Re-enable `buildConversationContext()` (or build a minimal
     `[SystemMessage, ...history, HumanMessage(userMessage)]`).
   - Re-enable / replace `generateCandidateMatches()` so `candidates` is
     defined before the return.

2. **Long latencies.** A single component-selector turn with `gpt-5-nano`
   takes ~20 s on OpenRouter (see `run.log`). The chat handler has no
   streaming and no client-side timeout.

3. **No tests run offline.** Every flow involves live LLM calls. See
   `TESTING.md` for the planned mocking strategy.

4. **`README.md` is the Next.js template** — leave `docs/` as the source of
   truth or rewrite the README to point here.

5. **Three duplicate prompt files.** `src/lib/server/prompts/index.ts` is the
   real one. There is also a stray `src/lib/server/prompts/manager.ts` listed
   in the user's open editors — `prompt-manager.ts` is the active singleton
   import path used by `actions/prompts.ts`. Worth cleaning up.
