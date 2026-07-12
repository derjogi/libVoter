# Testing — current state and a plan to make it free + reliable

## What exists today

- A single Playwright spec: `test-chat-flow.spec.ts` at the repo root.
  - 7 tests covering: app loads, ward selection, full flow, chat without
    ward, error handling, RAG `/api/rag/query` smoke, click-pattern variants.
  - It runs against `http://localhost:3000` — the dev server must be started
    separately.
- **No `playwright.config.ts`** — the spec uses Playwright's defaults, which
  is why it lives at the repo root rather than under `tests/`.
- No unit tests, no Vitest/Jest setup, no CI config.
- Coverage: rough end-to-end happy paths only; nothing exercises individual
  Server Actions, prompt formatting, the confidence calculator, the RAG
  ranking heuristics, or schema validation.

## Why the tests are unreliable

1. **They burn real LLM tokens.** Every `Continue` click eventually hits
   `selectNextComponent`/`processChatMessage` → OpenAI/Anthropic/OpenRouter.
2. **They hang.** `await page.waitForTimeout(20000)` is used as a stand-in
   for "AI might still be thinking". Cold-start vector-store population
   blows past that.
3. **No determinism.** The LLM is free to return any of six component types,
   so assertions like "checkboxes appear" only pass sometimes.
4. **Chroma + HF embeddings are external state.** First-run population can
   take minutes and isn't reset between tests.

## Goal

Run the same Playwright suite (and any future unit tests) **without making
real paid AI calls**. Two acceptable strategies:

- **Mock mode (preferred default for CI):** every Server Action backed by an
  LLM returns a deterministic canned response.
- **Local/free model mode:** swap in a local llama.cpp/Ollama model or a free
  OpenRouter route (e.g. `openrouter/meta-llama/...:free`). Useful for
  smoke-testing prompt changes without real cost.

Both should be selectable via env, e.g. `AI_MODE=mock | local | live`.

## Recommended plan

### 1. Introduce a model-factory seam

In `src/lib/server/ai/model-factory.ts`, branch on `AI_MODE`:

```ts
export function createChatModel(modelConfig?: AIModelConfig): ChatModel {
  if (process.env.AI_MODE === 'mock') {
    return new MockChatModel();   // implements .invoke() with canned JSON
  }
  // …existing OpenAI/Anthropic/OpenRouter branches
}

export function createEmbeddingModel(): EmbeddingModel {
  if (process.env.AI_MODE === 'mock') {
    return new FakeEmbeddings();  // returns deterministic vectors
  }
  return new HuggingFaceTransformersEmbeddings();
}
```

LangChain ships with `FakeChatModel` / `FakeEmbeddings` in
`@langchain/core/utils/testing` — use them to keep the rest of the code
unchanged. For richer behaviour, write a tiny class that returns canned JSON
keyed by which **prompt id** is being executed (the `PromptManager` already
logs `promptId`, so it can pass it via callback or via inspecting the prompt
text).

### 2. Introduce a "fixtures" canned-response set

Create `src/lib/server/ai/__mocks__/responses.ts` with deterministic stubs
keyed by prompt id:

```ts
export const MOCK_RESPONSES = {
  COMPONENT_SELECTOR: JSON.stringify({
    component: 'multiselect',
    reasoning: 'mock',
    data: {
      question: 'Which issues matter most to you?',
      options: [
        { id: 'housing', label: 'Housing', description: '' },
        { id: 'transport', label: 'Transport', description: '' },
      ],
      maxSelections: 2,
    },
  }),
  EXPLAIN_MATCH: 'Mock explanation: candidate aligns with your stated values.',
  // …etc.
};
```

`MockChatModel.invoke(messages)` looks at the last user message, finds the
`promptId` tag (the prompt manager already logs it; alternatively, prefix each
prompt template with a hidden marker), and returns the corresponding fixture.

### 3. Mock the vector store

When `AI_MODE=mock`, replace `getVectorStoreManager()` with an in-memory stub
that returns a deterministic `RAGContext` (3 fake ranked candidates). Skip the
Chroma docker dependency entirely in this mode. This also avoids
`chromadb`/`huggingface` startup cost.

### 4. Add a Playwright config + global setup

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'AI_MODE=mock bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
});
```

Move `test-chat-flow.spec.ts` under `tests/e2e/` and rewrite the assertions
to expect the mock fixtures (no more "either A or B" branches). The
`waitForTimeout(20000)` calls disappear because the mock model resolves
immediately.

### 5. Add unit tests for the deterministic pieces

These don't need any AI at all:

- `ConfidenceCalculator.calculate()` — pure function, very testable.
- `formatPrompt()` and `validatePromptVariables()` in
  `src/lib/server/prompts/index.ts`.
- `RAGQueryEngine.calculateRelevanceScore()`, `inferTopicFromQuestion()`,
  `extractStance()`, etc.
- Drizzle schema → Zod parsing of candidate JSON columns.

Suggested runner: **Vitest** (Bun-friendly, fast). One config under
`vitest.config.ts`, tests under `tests/unit/`. CI runs `bun test:unit && bun
test:e2e`.

### 6. Keep a "live smoke" job

Add a separate `e2e:live` script (env `AI_MODE=live`, real key) gated by a
manual workflow trigger so you can occasionally verify nothing has rotted —
without spending money on every PR.

## Quick wins before the bigger refactor

These give you a usable test signal in an afternoon:

1. **Hard-code `AI_MODE=mock` in the spec via `webServer`.** Skip 3–5 above
   and just stub `chatModel.invoke` for now via a small monkey-patch in a
   Playwright global setup file.
2. **Add `data-testid` attributes** to each dynamic component
   (`data-testid="seat-dropdown"`, etc.) so the spec doesn't rely on visible
   text, which the LLM keeps changing.
3. **Replace `waitForTimeout` with `expect(locator).toBeVisible({ timeout })`**
   — Playwright auto-retries until the element appears.
4. **Schema-check LLM output**. Wrap each `JSON.parse(result.response)` in a
   Zod validation matching the component's `data` shape; on failure, fall
   back instead of crashing. This alone fixes most "auto-generated component
   doesn't quite work" symptoms.

## Concrete file additions to plan

```
docs/
└── (this folder)
playwright.config.ts                 # NEW
tests/
├── e2e/
│   ├── chat-flow.spec.ts            # moved from repo root
│   └── fixtures.ts                  # canned LLM responses
├── unit/
│   ├── confidence-calculator.test.ts
│   ├── prompts-formatter.test.ts
│   └── rag-heuristics.test.ts
src/lib/server/ai/
├── mock-chat-model.ts               # NEW (only loaded when AI_MODE=mock)
└── mock-embeddings.ts               # NEW
src/lib/server/rag/
└── mock-vector-store.ts             # NEW
```

Then `package.json`:

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:e2e": "AI_MODE=mock playwright test",
    "test": "bun run test:unit && bun run test:e2e",
    "test:e2e:live": "AI_MODE=live playwright test"
  }
}
```

## Summary

Today: one Playwright spec, no config, every test pays for an LLM and racks
up flaky waits. Coverage is "happy path E2E only".

Target: deterministic mock-mode that runs the same spec for free in CI, plus
a small unit-test suite for the parts of the codebase that don't require AI
at all. Stretch goal: a free local model (Ollama / `:free` OpenRouter route)
to occasionally exercise real prompt behaviour without cost.
