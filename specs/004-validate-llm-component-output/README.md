---
status: complete
created: '2026-05-03'
tags: [ai, reliability]
priority: medium
---

# Validate LLM-generated component specs with Zod

> **Status**: complete · **Priority**: medium · **Created**: 2026-05-03

## Overview

The `COMPONENT_SELECTOR` prompt (and several others) returns JSON describing
the next UI component to render. Currently the only "validation" is
`JSON.parse()` in [`src/lib/actions/prompts.ts`](../../src/lib/actions/prompts.ts);
on a parse error a generic chat fallback is used, but there is **no
structural check** that the parsed object actually matches the component's
expected `data` shape.

This is the root cause of the maintainer's recurring "auto-generated
components don't quite work" complaint: the LLM returns valid JSON with
missing/renamed fields (`statements: []`, `options: undefined`, mixed-up
`questionId`, etc.), the component renders broken or empty, and the user
is stuck.

## Design

For every prompt that produces structured output, define a **Zod schema
matching the expected output**, validate after `JSON.parse()`, and on
failure fall back to a deterministic safe component (chat with a clear
message asking the user to repeat).

The relevant schemas already (mostly) exist as TypeScript interfaces in
[`src/types/index.ts`](../../src/types/index.ts):
`ChatData / YesNoData / MultiSelectData / DropdownData / FreeTextData /
SliderData`. Mirror each as a Zod schema (or generate via `zod-to-ts` —
the project already uses `drizzle-zod`).

```ts
// src/types/components.zod.ts (new file)
export const ComponentSpecSchema = z.discriminatedUnion('component', [
  z.object({ component: z.literal('chat'),        data: ChatDataSchema,        reasoning: z.string().optional() }),
  z.object({ component: z.literal('yesno'),       data: YesNoDataSchema,       reasoning: z.string().optional() }),
  z.object({ component: z.literal('multiselect'), data: MultiSelectDataSchema, reasoning: z.string().optional() }),
  z.object({ component: z.literal('dropdown'),    data: DropdownDataSchema,    reasoning: z.string().optional() }),
  z.object({ component: z.literal('freetext'),    data: FreeTextDataSchema,    reasoning: z.string().optional() }),
  z.object({ component: z.literal('slider'),      data: SliderDataSchema,      reasoning: z.string().optional() }),
]);
```

Then in [`actions/prompts.ts`](../../src/lib/actions/prompts.ts):

```ts
const parsed = JSON.parse(result.response);
const validated = ComponentSpecSchema.safeParse(parsed);
if (!validated.success) {
  console.warn('LLM returned invalid component spec', validated.error.format(), parsed);
  return SAFE_FALLBACK_COMPONENT;     // chat asking the user to retry
}
return { success: true, data: validated.data };
```

Apply the same pattern to:

- `generateNextQuestion` (NEXT_QUESTION_GENERAL)
- `generateFollowupQuestion` (FOLLOWUP_QUESTION)
- `RAGQueryEngine.queryWithContext` (`response.content` parse at
  [`query-engine.ts:84`](../../src/lib/server/rag/query-engine.ts#L84))

For prompts that return free-form text (`EXPLAIN_MATCH`,
`SUMMARIZE_PREFERENCES`) no schema is needed.

## Plan

- [ ] Add Zod schemas mirroring the `*Data` types in `src/types/index.ts`.
      Place in a new `src/types/components.zod.ts` to keep the originals
      framework-free.
- [ ] Build `ComponentSpecSchema` discriminated union.
- [ ] Wire it into `selectNextComponent` in `actions/prompts.ts`. On
      validation failure, log full diagnostic + return a safe fallback
      ("Could you rephrase that? I had trouble building the next
      question.").
- [ ] Repeat for `generateNextQuestion` / `generateFollowupQuestion`
      (define their own response schemas — they return
      `{question, type, context}` and similar).
- [ ] Add a Zod parse around the JSON returned by `RAGQueryEngine`.
- [ ] Add unit tests for each schema with a few realistic LLM outputs
      (good and bad).

## Test

- [ ] Unit tests covering: missing `options`, wrong field names,
      `maxSelections` not a number, statements as a string instead of
      array, all return safe-fallback rather than crashing.
- [ ] Manual run: deliberately tweak a prompt to make the LLM return
      garbage; confirm the UI shows the fallback chat instead of an
      empty/broken multiselect.
- [ ] After spec 006 lands, add a deterministic E2E test that replays a
      bad mock response and asserts the fallback path.

## Notes

- This will silently improve the perceived reliability of every
  AI-driven step.
- Worth logging validation failures somewhere durable so prompt
  regressions surface — fits well with a future Langfuse integration
  (`test-langfuse.js` is in the user's open editors).

## Dependencies

- Soft-depends on spec 001 (so the chat path works at all).
- Useful before specs 003 and 005, since both add new component shapes.
