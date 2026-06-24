# Architecture Overview

`lib-voter` is an AI-driven voting advisor built for the **Auckland 2025 local
council elections**. A user chooses their ward, the app collects preferences via
adaptive UI components (chat, yes/no, multi-select, dropdown, free-text,
slider), and an LLM gradually narrows down which mayoral / ward candidates align
with them.

The original `.instructions/` folder contains the historical design spec
(written before implementation). The notes below describe what the code
**actually** looks like today.

## Tech stack

| Concern              | Choice                                                   |
| -------------------- | -------------------------------------------------------- |
| Framework            | **Next.js 15** (App Router, Turbopack, React 19)         |
| Runtime / pkg mgr    | **Bun** (also works with Node)                           |
| Language             | TypeScript, strict                                       |
| Styling / UI         | TailwindCSS 4, shadcn/ui, Radix primitives, lucide icons |
| Forms / validation   | react-hook-form, zod, drizzle-zod                        |
| Relational DB        | **libSQL** (local SQLite file `voting-advisor.db`) via Drizzle ORM |
| Vector DB            | **Chroma** (Docker, `chromadb/chroma`, port 8000)        |
| LLM orchestration    | **LangChain** (`@langchain/openai`, `@langchain/anthropic`, `@langchain/community`) |
| Embeddings           | **HuggingFace Transformers** in-process (`@huggingface/transformers`) — chosen because the author had no OpenAI embedding credits and OpenRouter has no embeddings API |
| Chat models          | OpenAI / Anthropic / **OpenRouter** (selected via `provider/model` env strings) |
| Scraping             | Playwright (`playwright-core`, headed Chromium)          |
| Linting / formatting | Biome                                                    |
| E2E tests            | Playwright Test (`@playwright/test`)                     |
| Version control      | jj (Jujutsu) on top of git                               |

## Top-level layout

```
lib-voter/
├── data/
│   ├── candidate-list.json          # name + ward + link, scraped from voteauckland.co.nz
│   ├── all-candidates.json          # full scraped detail
│   └── chroma/                      # Chroma persistence volume (mounted into the docker container)
├── drizzle/                         # Generated SQL migrations (0000_…0003_)
├── voting-advisor.db                # SQLite DB (committed to repo!)
├── docker-compose.yml               # chroma service
├── scripts/
│   ├── scrape-candidates.ts         # Playwright scraper → DB → vector store
│   ├── setup-env.ts                 # writes .env.local skeleton
│   ├── test-election-config.ts
│   ├── inspect-site.ts
│   └── fix-duplicate-wards.sql
├── src/
│   ├── app/                         # Next.js routes
│   │   ├── page.tsx                 # the entire single-page UI
│   │   ├── layout.tsx
│   │   ├── api/rag/query/route.ts   # one REST endpoint exposing RAG query
│   │   └── test-db/                 # debug page
│   ├── components/
│   │   ├── candidates/CandidateList.tsx
│   │   ├── layout/RightPanel.tsx
│   │   ├── dynamic/                 # the adaptive UI components
│   │   │   ├── ComponentRenderer.tsx
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── YesNoQuestion.tsx
│   │   │   ├── MultiSelectChecklist.tsx
│   │   │   ├── DropdownSelect.tsx
│   │   │   ├── FreeTextInput.tsx
│   │   │   └── QuantitativeSlider.tsx
│   │   └── ui/                      # shadcn/radix primitives
│   ├── lib/
│   │   ├── actions/                 # 'use server' Server Actions
│   │   │   ├── chat.ts              # processChatMessage()
│   │   │   ├── prompts.ts           # selectNextComponent, generateFollowupQuestion, explainCandidateMatch, summarizeUserPreferences
│   │   │   ├── rag.ts               # queryRAGContext, searchPolicies
│   │   │   └── database.ts          # getUniqueWards, getCandidatesByWard, getMayorCandidates, …
│   │   ├── client/hooks/            # useChat, usePrompts, useRAG (client-only)
│   │   ├── server/                  # 'server-only' modules
│   │   │   ├── ai/
│   │   │   │   ├── chat-handler.ts          # AIChatHandler (currently broken — see below)
│   │   │   │   ├── confidence-calculator.ts # heuristic 0–100 score
│   │   │   │   ├── model-factory.ts         # createChatModel + createEmbeddingModel
│   │   │   │   └── config.ts                # parses AI_MODEL_* env strings
│   │   │   ├── prompts/
│   │   │   │   ├── index.ts                 # PROMPTS template registry + formatter/validator
│   │   │   │   └── prompt-manager.ts        # singleton; injects election variables, calls LLM
│   │   │   ├── rag/
│   │   │   │   ├── vector-store.ts          # VectorStoreManager (Chroma + HuggingFace embeddings)
│   │   │   │   └── query-engine.ts          # RAGQueryEngine.queryWithContext / getPrioritizedCandidates
│   │   │   ├── db.ts                        # libSQL client + drizzle()
│   │   │   └── migrations.ts                # programmatic drizzle-kit
│   │   ├── db/schema.ts             # candidates, parties, app_settings tables
│   │   └── config/election.ts       # electionConfig (Auckland, 2025, key topics …)
│   └── types/                       # shared TS interfaces and Zod schemas
└── test-chat-flow.spec.ts           # Playwright E2E spec (the only test file)
```

## Runtime architecture

```diagram
                             Browser (React 19, client comp.)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  src/app/page.tsx          ← single-page voting advisor              │
   │   ├─ ComponentRenderer  →  dropdown / multiselect / yesno / chat /…  │
   │   ├─ RightPanel         →  CandidateList with confidence scores      │
   │   └─ useChat hook       →  calls Server Actions                      │
   └──────────────┬─────────────────────────────────┬─────────────────────┘
                  │ Server Actions ('use server')   │
                  ▼                                 ▼
   ╭───────────────────────────╮     ╭──────────────────────────────╮
   │ actions/database.ts       │     │ actions/chat.ts              │
   │  → drizzle → libSQL file  │     │  → AIChatHandler             │
   │     (voting-advisor.db)   │     │      → ConfidenceCalculator  │
   ╰───────────────────────────╯     │      → PromptManager         │
                                     │      → selectNextComponent   │
   ╭───────────────────────────╮     │      → RAGQueryEngine        │
   │ actions/prompts.ts        │◀────╯      → chatModel.invoke()    │
   │  → PromptManager.execute  │     ╰──────────────────────────────╯
   │     templates in          │
   │     server/prompts/index  │     ╭──────────────────────────────╮
   ╰────────────┬──────────────╯     │ actions/rag.ts               │
                │ LangChain          │  → RAGQueryEngine            │
                ▼                    │      → VectorStoreManager    │
   ╭───────────────────────────╮     │          → Chroma (Docker)   │
   │ OpenAI / Anthropic /      │     │          → HF embeddings     │
   │ OpenRouter chat models    │     ╰──────────────────────────────╯
   ╰───────────────────────────╯
```

### Key modules in detail

- **`src/lib/server/ai/chat-handler.ts` — `AIChatHandler.processMessage`**
  Orchestrates a single user turn: confidence → (was supposed to) RAG context →
  build messages → LLM → `selectNextComponent` for the next UI step → optional
  follow-up question. **Currently broken**: the `messages` and `candidates`
  variables are referenced after their construction was commented out (lines
  ~55–77). Anything routing through `processChatMessage` will throw
  `ReferenceError`. The ward-selection branch in `page.tsx` calls
  `selectNextComponent` directly and does work.

- **`src/lib/server/prompts/`** — Prompt registry (`PROMPTS`) and
  `PromptManager`. Templates use `{variable}` placeholders. The manager
  auto-injects `electionYear/Type/Location/KeyTopics/Description/Wards` from
  `lib/config/election.ts`.

- **`src/lib/server/rag/vector-store.ts`** — Singleton `VectorStoreManager`
  that talks to Chroma at `CHROMA_URL`. On first use it loads an existing
  collection or creates one. If empty, it pulls every row from the SQLite
  candidates table, builds Documents, splits into 1000/200 chunks, and inserts
  in batches of 50. Embeddings come from local HuggingFace Transformers (no
  cloud cost).

- **`src/lib/server/rag/query-engine.ts`** — `RAGQueryEngine.queryWithContext`
  does similarity search (top 10) then asks the LLM to format the result as
  JSON. Includes heuristics (`rankCandidatesBySemanticSimilarity`,
  `calculateRelevanceScore`) for boosting matches.

- **`src/lib/server/ai/model-factory.ts`** — Reads `AI_MODEL_*` env vars in
  the form `provider/model` (e.g. `openrouter/openai/gpt-5-nano`) and returns
  a configured `ChatOpenAI` / `ChatAnthropic`. OpenRouter is routed through
  the OpenAI client with a custom `baseURL`. Embeddings are hard-coded to
  HuggingFace.

- **`src/lib/server/ai/confidence-calculator.ts`** — Pure-TypeScript heuristic
  scoring (response quality, topic coverage, consistency, interaction count)
  weighted into a 0–100 number. No LLM needed.

- **`src/lib/db/schema.ts`** — `candidates(id, name, party, ward,
  candidate_statement, key_positions JSON, why, key_skills, top_issues,
  supporting_links JSON, photo_url, created_at)`, plus `parties`,
  `app_settings`, and election-scoped `evidence_sources`. Evidence rows can
  be candidate/party-owned or corpus-level and retain source-system identity,
  document type/status, and legislative term. Drizzle generates Zod schemas
  via `drizzle-zod`.

- **`src/lib/server/ingestion/`** — Shared evidence ETL: adapter discovery,
  robots/rate-limit guards, normalization, optional identity resolution, and
  stable-ID upsert. `nz-hansard` discovers Parliament 54 transcript sections
  from the official Hansard client API, caches each daily transcript fetch,
  and extracts individual speeches/questions/votes rather than duplicating
  full Daily records.

- **`scripts/scrape-candidates.ts`** — Playwright (headed Chromium) scraper
  that walks `voteauckland.co.nz` candidate pages, persists rows into the
  SQLite DB with upsert, writes JSON to `data/`, and finally calls
  `getVectorStoreManager()` to warm Chroma. The scraping body of `main()` is
  currently commented out — only the vector-store initialization step runs.

- **`scripts/embed-evidence.ts`** — offline evidence-embedding job that chunks
  and embeds the canonical `evidence_sources` rows into the derived Chroma
  collection. Use `--repopulate` to rebuild the collection from scratch.

## Data flow for a single user turn

1. Browser renders a component spec (`{ type, data }`).
2. User submits → `handleComponentResponse` in `page.tsx`.
3. For the initial **ward dropdown**: candidates are fetched from libSQL
   (`getMayorCandidates` + `getCandidatesByWard`), a synthetic
   "conversation state" string is built, and `selectNextComponent` calls the
   `COMPONENT_SELECTOR` prompt. The LLM returns `{component, reasoning, data}`
   which becomes the next UI component.
4. For subsequent turns: `useChat.sendMessage` → Server Action
   `processChatMessage` → `AIChatHandler.processMessage` (currently throws —
   see "Known issues" in `SETUP.md`).
5. Response carries `{message, confidence, shouldShowCandidates,
   nextComponent, candidateMatches, followupQuestion}`. `shouldShowCandidates`
   becomes true once `confidence ≥ AI_CONFIDENCE_THRESHOLD` AND
   `responses ≥ MIN_INTERACTIONS_BEFORE_RESULTS`.

## Known structural issues

- **`AIChatHandler.processMessage` is broken**: references `messages` /
  `candidates` that were commented out. Needs to be repaired before chat
  beyond the first ward question can work.
- **`README.md` is the default Next.js template** — no project-specific
  setup notes.
- **`voting-advisor.db` is committed**, so the candidate data ships with the
  repo, but `data/chroma/` content is not — the evidence collection is built
  offline via `scripts/embed-evidence.ts` and stored under Chroma's volume.
  The app only loads it.
- **`.env*` is gitignored** (per `.gitignore` line 36) so secrets stay local.
- **No mock layer for AI**: every Server Action goes straight to the
  configured LLM. Tests therefore consume real API quota — see `TESTING.md`.
- **Prompt model is hard-coded to `small`** in `PromptManager.constructor`
  and `RAGQueryEngine.constructor`; `large` / `reasoning` are unused.
- **`api/rag/query` route exists** alongside Server Actions, used by the E2E
  test for "vector store initialization".

## Election configuration

Single source of truth: `src/lib/config/election.ts`:

```ts
export const electionConfig: ElectionConfig = {
  location: "Auckland, New Zealand",
  year: 2025,
  type: "Local Council Elections",
  keyTopics: ["Housing", "Transport", "Environment", "Economy",
              "Infrastructure", "Community Services"],
  description: "Auckland Council local elections for mayor and ward representatives"
};
```

Changing election requires: (a) editing this file, (b) re-running the
candidate scraper against the new data source, (c) wiping `data/chroma/` so
the vector store repopulates.
