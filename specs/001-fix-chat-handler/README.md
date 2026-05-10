---
status: in-progress
created: '2026-05-03'
tags: [bug, chat]
priority: high
---

# Fix AIChatHandler.processMessage

> **Status**: planned · **Priority**: high · **Created**: 2026-05-03

## Overview

`AIChatHandler.processMessage` in
[`src/lib/server/ai/chat-handler.ts`](../../src/lib/server/ai/chat-handler.ts)
throws `ReferenceError` because it references `messages` and `candidates`
variables whose construction was commented out (~lines 55–80). As a result,
**every chat turn after the initial ward dropdown fails**. The first ward
question only works because [`src/app/page.tsx`](../../src/app/page.tsx)
bypasses the handler and calls `selectNextComponent` directly.

This is the single biggest blocker for further development on the chat path.
Without it fixed, none of the other improvements can be tested end-to-end.

## Design

Two variables need to be defined before the `return` block:

1. **`messages`** — the LangChain message array passed to
   `chatModel.invoke()`. Re-enable `buildConversationContext()` (currently
   commented out around L66–L73) or build a minimal version inline:
   ```ts
   const messages = [
     new SystemMessage(systemPrompt),
     ...conversationHistory.map(h =>
       h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content)
     ),
     new HumanMessage(userMessage),
   ];
   ```

2. **`candidates`** — the `CandidateMatch[]` returned to the client. Either
   re-enable the previously-commented `generateCandidateMatches(...)` call,
   or — preferably — wait until spec 005 lands and pull from the
   "remaining candidates" tracker. For an interim fix, return `[]` and let
   the client keep its existing list.

The RAG context block (L57–L73) can stay commented out; it is not needed
for chat to work and is being reworked in later specs.

## Plan

- [ ] Add a regression test (or at least a manual repro doc) demonstrating
      the current `ReferenceError`.
- [ ] Reinstate `messages` construction (system prompt + history + new
      message). Keep it small — no RAG yet.
- [ ] Reinstate `candidates` (start with `[]`; deeper logic moves to spec
      005).
- [ ] Verify chat works past the ward selection: ward → AI question →
      answer → next AI question, all without throwing.
- [ ] Update `docs/USER_FLOW.md` and `AGENTS.md` "Known broken" section to
      remove this from the sharp-edge list.

## Test

- [ ] Manually: select a ward, answer the next AI-generated question with
      a free-text response, see a follow-up appear (no error in server
      console).
- [ ] `bunx playwright test test-chat-flow.spec.ts` no longer hits a 500
      on the second turn (the test currently can't reach this state).
- [ ] Once spec 006 (mock mode) lands, add an automated test that drives
      three full turns deterministically.

## Notes

- The original spec for this handler lived in
  [`.instructions/04_ai_chat_system.md`](../../.instructions/04_ai_chat_system.md)
  — useful background but **not** ground truth.
- Don't try to fix everything in this handler at once. Spec 002, 004, 005
  rework large chunks of it; this spec is *only* about un-breaking the
  current code path.

## Dependencies

None. This is the foundation everything else builds on.
