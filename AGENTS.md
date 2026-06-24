# Agent onboarding

> **Read this file first.** It is the entry point for any AI agent (or human)
> picking up development on `lib-voter`. It is intentionally short — deeper
> details live in `docs/` and are linked from each section.

## What this project is

An AI-driven voting advisor for the **Auckland 2025 local council
elections**. A user picks their ward, the app asks adaptive questions
(chat / yes-no / multi-select / dropdown / free-text / slider), an LLM picks
which question type to ask next, and a confidence-gated right panel reveals
candidate matches with AI-generated explanations.

Single-page Next.js 15 (App Router, React 19, Tailwind/shadcn, Bun runtime).
LangChain orchestrates LLMs (OpenAI / Anthropic / **OpenRouter**). Candidate
data lives in a committed SQLite file (`voting-advisor.db`) via Drizzle ORM.
RAG uses **Chroma** in Docker with **local HuggingFace embeddings** (no
embedding API costs).

## 🚨 CRITICAL: Before ANY Task

**STOP and check these first:**

1. **Discover context** → Use `board` tool to see project state
2. **Search for related work** → Use `search` tool before creating new specs
3. **Never create files manually** → Always use `create` tool for new specs

> **Why?** Skipping discovery creates duplicate work. Manual file creation breaks LeanSpec tooling.

## 🔧 How to Manage Specs

### CLI Commands

Use CLI commands:

```bash
lean-spec board              # Project overview
lean-spec list               # See all specs
lean-spec search "query"     # Find relevant specs
lean-spec create <name>      # Create new spec
lean-spec update <spec> --status <status>  # Update status
lean-spec link <spec> --related <other>    # Add relationships
lean-spec unlink <spec> --related <other>  # Remove relationships
lean-spec deps <spec>        # Show dependencies
```

**Tip:** Check if you have LeanSpec MCP tools available before using CLI.

## ⚠️ SDD Workflow Checkpoints

### Before Starting ANY Task

1. 📋 **Run `board`** - What's the current project state?
2. 🔍 **Run `search`** - Are there related specs already?
3. 📝 **Check existing specs** - Is there one for this work?

### During Implementation

4. 📊 **Update status to `in-progress`** BEFORE coding
5. 📝 **Document decisions** in the spec as you work
6. 🔗 **Link related specs** if you discover connections

### After Completing Work

7. ✅ **Update status to `complete`** when done
8. 📄 **Document what you learned** in the spec
9. 🤔 **Create follow-up specs** if needed

### 🚫 Common Mistakes to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Create spec files manually | Use `create` tool |
| Skip discovery before new work | Run `board` and `search` first |
| Leave status as "planned" after starting | Update to `in-progress` immediately |
| Finish work without updating spec | Document decisions, update status |
| Edit frontmatter manually | Use `update` tool |
| Forget about specs mid-conversation | Check spec status periodically |

## Core Rules

1. **Read README.md first** - Understand project context
2. **Check specs/** - Review existing specs before starting
3. **Use MCP tools** - Prefer MCP over CLI when available
4. **Follow LeanSpec principles** - Clarity over documentation
5. **Keep it minimal** - If it doesn't add clarity, cut it
6. **NEVER manually edit frontmatter** - Use `update`, `link`, `unlink` tools
7. **Track progress in specs** - Update status and document decisions

## When to Use Specs

**Write a spec for:**
- Features affecting multiple parts of the system
- Breaking changes or significant refactors
- Design decisions needing team alignment

**Skip specs for:**
- Bug fixes
- Trivial changes
- Self-explanatory refactors

## Spec Relationships

### `related` - Bidirectional Soft Reference
Informational relationship between specs. Shown from both sides.
**Use when:** Related topics, coordinated but not blocking work.

### `depends_on` - Directional Blocking Dependency
Hard dependency - spec cannot start until dependencies complete.
**Use when:** True blocking dependency, work order matters.

**Default:** Use `related`. Reserve `depends_on` for true blockers.

## Quality Standards

- **Status tracking is mandatory:**
  - `planned` → after creation
  - `in-progress` → BEFORE starting implementation
  - `complete` → AFTER finishing implementation
- Specs stay in sync with implementation
- Never leave specs with stale status

## Spec Complexity Guidelines

| Tokens | Status |
|--------|--------|
| <2,000 | ✅ Optimal |
| 2,000-3,500 | ✅ Good |
| 3,500-5,000 | ⚠️ Consider splitting |
| >5,000 | 🔴 Should split |

Use `tokens` tool to check spec size.

---
**Remember:** LeanSpec tracks what you're building. Keep specs in sync with your work!
---

## Where to look (in this order)

| Need to understand…                                | Read                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| The big picture, file layout, runtime data flow    | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                       |
| How to install and run from scratch                | [`docs/SETUP.md`](docs/SETUP.md)                                     |
| What happens screen-by-screen and component shapes | [`docs/USER_FLOW.md`](docs/USER_FLOW.md)                             |
| Test status today and the plan for AI-free tests   | [`docs/TESTING.md`](docs/TESTING.md)                                 |
| Product intent vs. code, and the NZ 2026 migration | [`docs/REQUIREMENTS_GAP.md`](docs/REQUIREMENTS_GAP.md)               |
| Original (historical, partially out-of-date) spec  | [`.instructions/`](./.instructions) — treat as design intent, **not** ground truth |

When the docs disagree with the code, **the code wins**. Update the doc.

## Required prerequisites for running anything

1. `bun install`
2. `.env.local` with at least `OPENROUTER_API_KEY` (or `OPENAI_API_KEY` /
   `ANTHROPIC_API_KEY`) and the model strings from `docs/SETUP.md`.
3. Chroma running: `docker compose up -d chroma`
4. `bun run dev` — first request takes minutes (downloads HF model, populates
   Chroma).

Embeddings are **never** OpenAI — `createEmbeddingModel()` is hard-coded to
`HuggingFaceTransformersEmbeddings` in
[`src/lib/server/ai/model-factory.ts`](src/lib/server/ai/model-factory.ts).

## Known broken / sharp edges (non-obvious)

- ~~**`AIChatHandler.processMessage` throws**~~ — fixed in spec 001 (May
  2026). The handler now builds `messages` inline and returns `[]` for
  candidates; full ranking lives in spec 005.
- ~~**No mock layer for the LLM.**~~ Spec 006 added `AI_MODE=mock`. Set it
  in `.env.local` (or per-command, e.g. `AI_MODE=mock bun run dev`) and
  every chat / embedding call returns deterministic fixtures from
  [`src/lib/server/ai/__mocks__/responses.ts`](src/lib/server/ai/__mocks__/responses.ts).
  Vitest unit tests run under mock mode automatically (`bun run test`).
- ~~**LLM JSON outputs aren't validated.**~~ Spec 004 added Zod schemas in
  [`src/types/components.zod.ts`](src/types/components.zod.ts) used by
  every `actions/prompts.ts` entry point. Malformed responses fall back to
  a safe chat component instead of breaking the UI.
- **`scripts/scrape-candidates.ts` `main()` is mostly commented out** — it
  currently only re-populates the vector store. Re-enable the body to
  actually re-scrape, and note it uses **headed** Chromium.
- **Prompt model is hard-coded to `small`** in `PromptManager` and
  `RAGQueryEngine`; `large`/`reasoning` are unused.
- **`README.md` is the default Next.js template.** Don't trust it; this file
  + `docs/` is the source of truth.
- Three almost-duplicate prompt files exist:
  [`src/lib/server/prompts/index.ts`](src/lib/server/prompts/index.ts) is the
  template registry,
  [`src/lib/server/prompts/prompt-manager.ts`](src/lib/server/prompts/prompt-manager.ts)
  is the active singleton, and `src/lib/server/prompts/manager.ts` is a
  stale duplicate worth deleting.

## Architectural rules to respect when editing

- **Server-only code lives under `src/lib/server/`** and must not be
  imported from a client component. Cross via Server Actions in
  [`src/lib/actions/`](src/lib/actions) (all marked `'use server'`).
- **Client-only hooks live in `src/lib/client/hooks/`**.
- **Types are centralized** in [`src/types/`](src/types). Drizzle schemas in
  [`src/lib/db/schema.ts`](src/lib/db/schema.ts) double as the source of
  truth for candidate data via `drizzle-zod`.
- **Election parameters** are configured in a single file:
  [`src/lib/config/election.ts`](src/lib/config/election.ts). To change
  election: edit it, re-scrape, wipe `data/chroma/`.

## Useful commands

| Command                                          | Purpose                                |
| ------------------------------------------------ | -------------------------------------- |
| `bun run dev`                                    | Chroma (bg) + Next dev server          |
| `bun run lint` / `bun run format`                | Biome                                  |
| `bun run setup-env [setup\|validate]`            | Env scaffolding / validation           |
| `bun run scrape:candidates`                      | Playwright scraper (headed Chromium)   |
| `bun run ingest:sources --source auckland`       | Evidence-source ETL → `evidence_sources` (spec 010) |
| `bunx drizzle-kit generate / migrate`            | Drizzle migrations                     |
| `bunx playwright test test-chat-flow.spec.ts`    | E2E spec (currently hits real LLMs)    |

## Conventions

- **Package manager**: Bun (`bun.lock`). npm/pnpm probably work but aren't
  tested.
- **Subagents**: Agents may delegate suitable independent tasks to subagents
  and run them in parallel.
- **Version control**: Jujutsu (`.jj/`) on top of git (`.git/`). The original
  spec asks for `jj describe` after each step. After each coherent unit of
  work, commit the completed changes with `jj` before starting the next unit.
- **Lint/format**: Biome (`biome.json`). Run `bun run lint` before
  committing.
- **Tests**: Playwright spec at the repo root for now; new tests should land
  under `tests/` once the structure in `docs/TESTING.md` is in place.

## When in doubt

1. Re-read the relevant `docs/*.md`.
2. Search the actual code (`rg`) before guessing.
3. Update `AGENTS.md` and `docs/` whenever you change something structural,
   so the next agent (or you, in two months) doesn't have to reverse-engineer
   it again.
