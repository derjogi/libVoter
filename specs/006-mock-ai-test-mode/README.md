---
status: planned
created: 2026-05-03
priority: medium
tags:
- testing
depends_on:
- '001'
- '004'
created_at: 2026-05-03T01:39:17.367071278Z
updated_at: 2026-05-03T01:39:17.415207976Z
---

# AI_MODE=mock|live for free, deterministic tests

> **Status**: planned · **Priority**: medium · **Created**: 2026-05-03

## Overview

Today every Server Action goes to a real LLM (OpenAI / Anthropic /
OpenRouter), so:

- The Playwright spec
  [`test-chat-flow.spec.ts`](../../test-chat-flow.spec.ts) burns paid
  tokens on every run.
- It uses `waitForTimeout(20000)` placeholders because real LLM calls take
  10–90 s — leading to flaky, slow runs.
- There is no offline / CI-friendly way to verify the user flow.

This spec adds an `AI_MODE=mock|live` switch. In mock mode every LLM and
embedding call returns deterministic fixtures, the Chroma vector store is
replaced by an in-memory stub, and Playwright tests run in seconds with no
network and no cost.

Full plan already drafted in [`docs/TESTING.md`](../../docs/TESTING.md);
this spec is the actionable subset.

## Design

### Switch

In [`src/lib/server/ai/model-factory.ts`](../../src/lib/server/ai/model-factory.ts):

```ts
export function createChatModel(modelConfig?: AIModelConfig): ChatModel {
  if (process.env.AI_MODE === 'mock') return new MockChatModel();
  // …existing branches
}
export function createEmbeddingModel(): EmbeddingModel {
  if (process.env.AI_MODE === 'mock') return new FakeEmbeddings();
  return new HuggingFaceTransformersEmbeddings();
}
```

`MockChatModel.invoke(messages)` inspects the prompt to decide which
fixture to return. Easiest implementation: every prompt template gets a
hidden marker like `<!-- promptId: COMPONENT_SELECTOR -->` so the mock
can dispatch on it. Alternatively, key off the system message text.

### Fixtures

A small file `src/lib/server/ai/__mocks__/responses.ts` exports a
`MOCK_RESPONSES: Record<PromptId, string>` map with deterministic JSON
that matches the Zod schemas from spec 004. Example:

```ts
export const MOCK_RESPONSES: Record<string, string> = {
  COMPONENT_SELECTOR: JSON.stringify({
    component: 'multiselect',
    reasoning: 'mock — pick top issues',
    data: {
      question: 'Which issues matter most?',
      options: [
        { id: 'housing', label: 'Housing', description: '' },
        { id: 'transport', label: 'Transport', description: '' },
        { id: 'climate', label: 'Climate', description: '' },
      ],
      maxSelections: 3,
    },
  }),
  EXPLAIN_MATCH: 'Mock explanation: candidate aligns with stated values.',
  TAG_TOPICS: JSON.stringify(['housing', 'transport']),
  // …
};
```

### Mock vector store

Replace `getVectorStoreManager()` in mock mode with an in-memory stub
that returns 3 deterministic ranked candidates regardless of query. Skips
the Chroma docker dependency entirely → faster CI, no `data/chroma/`
state to manage.

### Playwright config

Create a real `playwright.config.ts` (currently missing — the spec
runs with defaults):

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

Move `test-chat-flow.spec.ts` into `tests/e2e/`, replace
`waitForTimeout(20000)` with proper `expect(locator).toBeVisible()`
assertions, and tighten the assertions now that responses are
deterministic.

### Optional: free model mode

A `AI_MODE=local` branch can route to an Ollama instance or a free
OpenRouter model (e.g. `openrouter/meta-llama/...:free`) for occasional
cheap end-to-end smoke testing of prompt changes. Lower priority; can
land later.

## Plan

- [ ] Add `AI_MODE` to `.env.example` and the env validator
      ([`src/lib/config/index.ts`](../../src/lib/config/index.ts)).
- [ ] Implement `MockChatModel` and `FakeEmbeddings` (LangChain ships
      `FakeChatModel` / `FakeEmbeddings` in
      `@langchain/core/utils/testing`; wrap them).
- [ ] Add fixture file `src/lib/server/ai/__mocks__/responses.ts`.
- [ ] Branch `createChatModel` and `createEmbeddingModel` on
      `AI_MODE`.
- [ ] Add an in-memory mock for `VectorStoreManager`. Skip Chroma
      entirely in mock mode.
- [ ] Add `playwright.config.ts` with the `webServer` block above.
- [ ] Move `test-chat-flow.spec.ts` to `tests/e2e/`, swap
      `waitForTimeout` for explicit `expect(...).toBeVisible(...)`,
      tighten assertions to match the fixtures.
- [ ] Add `data-testid` attributes to dynamic components so tests don't
      rely on visible LLM-generated text.
- [ ] `package.json`: add `test:e2e`, `test:e2e:live` scripts.

## Test

- [ ] `AI_MODE=mock bun run dev` starts in <5 s, no Chroma needed,
      first request returns the mock multiselect immediately.
- [ ] `bunx playwright test` (under mock mode) finishes in seconds with
      no network calls (verify with `--reporter=line` and a packet
      sniffer / firewall block to be sure).
- [ ] `AI_MODE=live bunx playwright test` still works against real
      models — kept as a manual smoke job, not run on every PR.
- [ ] Adding/removing a fixture causes precisely the matching test
      assertions to need updating.

## Notes

- This spec unlocks safe iteration on every other spec in this
  directory. Land it early.
- The fixture-driven approach pairs well with spec 004 (Zod
  validation) — fixtures double as schema regression tests.
- Vitest unit tests for pure modules (`ConfidenceCalculator`,
  `formatPrompt`, RAG heuristics) can be added in the same spec or a
  follow-up.

## Dependencies

- **Soft-depends on**: spec 001 (so the mock-mode chat path is
  exercising real code that doesn't crash) and spec 004 (so fixtures
  can be schema-checked).
