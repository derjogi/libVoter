---
status: complete
created: 2026-05-22
priority: high
tags:
- bug
- chat
- history
- ui
created_at: 2026-05-22T04:12:56.465173250Z
updated_at: 2026-05-22T04:28:52.029254695Z
completed_at: 2026-05-22T04:28:52.029254695Z
transitions:
- status: complete
  at: 2026-05-22T04:28:52.029254695Z
---

# Fix chat history: keep all interactions in full with no truncation or collapsing

> **Status**: planned · **Priority**: high · **Created**: 2026-05-22

## Overview

The left-panel chat history (`ChatHistory` in `src/components/dynamic/ChatHistory.tsx`) is the
cumulative record of every question the user answered. Three distinct bugs make it
incomplete and misleading:

1. **Ward-selection step missing from history.**  
   `handleComponentResponse` in `page.tsx` returns early at line 185 after
   completing the ward-selection branch, so the ward response is never
   appended to `userResponses` and `ChatHistory` never shows it.

2. **Question text is blank for non-chat steps.**  
   `compDisplayQ` (page.tsx lines 211–216) uses a brittle fallback chain:
   it attempts to read `activeComp.data.question` for every non-chat type, but
   `question` is optional in the Zod schema and many LLM-generated specs omit
   it (e.g. `multiselect` / `dropdown` items never set it, only
   `questionId`). The result is an empty string rendered as a blank line in the
   history header.

3. **Stale `userResponseHistory` passed to the LLM.**  
   `useChat.sendMessage` captures `userResponses` via closure at definition
   time (line 34 of `useChat.ts`). Because `setUserResponses` is async,
   every `await sendMessage(…, userResponses, …)` call hands the LLM a stale
   copy — one step behind — causing AI responses that ignore the most recent
   answer.

Beyond the bugs, the user wants the history panel **simplified**: no
collapsing, no summarising, no 80-character truncation of free-text answers.
Every question and its full answer should be visible at a glance.

## Design

### Principles
- `userResponses` is the single source of truth for interaction history.
- `ChatHistory` is purely presentational — it renders `userResponses` verbatim
  without modifying, transforming, or hiding anything.
- `sendMessage` always receives the **latest** `userResponses`, not a stale
  closure copy.

### Three changes

#### 1 — `src/app/page.tsx`: fix stale closure + store full question/value
- Replace the `useChat.sendMessage` dependency on the stale
  `userResponses` prop with a `useRef` that is always updated in
  `handleComponentResponse` before calling `sendMessage`.  
  (Pattern: create `const userResponsesRef = useStateSync(userResponses)`
  or update `userResponsesRef.current` inside the same `setUserResponses`
  callback that appends the new entry.)
- In the `handleComponentResponse` ward-selection branch, append the ward
  `UserResponse` to `userResponses` **before** returning, exactly as the
  other branches do. Remove the early `return` at line 185 — the ward step
  should also flow through `sendMessage` so the LLM gets the ward context.
- In the `compDisplayQ` / `compDisplayQId` block (lines 211–222), always use
  `activeComp?.data.question` first, and fall back to
  `extractQuestionText(activeComp)` for every type. Remove the special-cased
  empty `"response_turn"` override.
- Add `compDisplayQ` to the `question` field of `userResponse` unconditionally
  (no more optional field that leaves blank rows in render).

#### 2 — `src/components/dynamic/ChatHistory.tsx`: flatten, no collapse, no truncate
- **Remove all `useExpanded` / Chevron state** — every step is permanently
  expanded.
- Show every step as:  
  `Q: <question text>`  
  `A: <full answer text, verbatim>`
- Remove `renderExpandedDetail` — the question already shows the full question
  text, the answer shows the full response value. No need to reconstruct badges
  or expand/collapse UI.
- Remove the `hasDetail` gate — no content is hidden behind an expansion.
- Remove the 80-character `value.slice(0, 80) + "…"` truncation in
  `formatResponseSummary`.
- For `multiselect` / `dropdown`, render selected `<Badge>` tags inline
  (no expand/collapse). For `freetext`, render the full text in a `<p>` block.
- Keep step index and timestamp visible.

#### 3 — `src/components/dynamic/ChatHistory.tsx`: fix `extractQuestionText`
- `extractQuestionText` already handles `yesno` and falls back to
  `data.question` / `data.prompt`. It works; the problem is that
  `compDisplayQ` in `page.tsx` bypasses it. With change #1, `compDisplayQ`
  will go through `extractQuestionText` for every type, so no change to
  `ChatHistory.tsx` itself is needed here.

**Out of scope (intentionally left alone):**
- No changes to component-selection logic, prompt templates, or LLM flow.  
- No changes to the right-panel / candidate ranking.  
- No new state or persisted keys.

## Test

- [ ] **Manual: ward step appears.** Pick a ward → the history panel now shows
  "Q: Which [Ward] do you live in? A: [ward name]" as step 1.
- [ ] **Manual: question text present for every step.** Cycle through
  dropdown → multiselect → freetext → yesno → slider and confirm each step
  header shows a non-blank question.
- [ ] **Manual: no truncation.** Enter a free-text answer longer than 80
  characters — the full text is visible in the history panel.
- [ ] **Manual: no missing steps.** Complete 5+ questions and confirm the count
  in the sidebar badge matches the number of visible history items.
- [ ] **Manual: LLM receives latest answers.** After logging, confirm
  `processChatMessage` receives `userResponseHistory` that includes the most
  recent response (same length as `page.tsx`'s `userResponses` at call time).

## Decisions

- `userResponsesRef` (a `useRef` kept in sync via an identity `useEffect`) was chosen over a custom `useStateSync` hook because it is simpler: one ref, one `<Effect` that reassigns `.current` on every render where `userResponses` changed. Both `page.tsx` and `useChat` see the latest value through the ref, while the existing `usePersistedState` persistence contract is untouched.
- `extractQuestionText` was moved from a private helper to a named export so that `page.tsx` can use the same logic at capture-time (`handleComponentResponse`), eliminating the original `compDisplayQ` type-branch that gave blank strings for `multiselect`/`dropdown`.
- `extractQuestionText(activeComp ?? undefined)` is the `compDisplayQ` value stored on every `UserResponse`. `ChatHistory` now renders `step.question` unconditionally — no fallback needed at render time, and the panel no longer calls `extractQuestionText` at all.
- The flattened `ChatHistory` uses raw CSS: `white-space-pre-wrap break-words` on the `<p>` for the answer text rather than a helper function. This keeps freetext, slider numbers, comma-separated multi-select ids, and yesno stanzas all readable without special format functions per type.

## Notes

- The three bugs were originally filed in specs 001 and 003; this spec
  consolidates all history-related anomalies into one focused fix.
- The `userResponses` tail-call return pattern used in the ward branch was
  intentionally never revisited after spec 001 removed the `messages`/
  `candidates` crash — it remained a latent gap.
