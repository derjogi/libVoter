---
status: complete
created: 2026-06-11
priority: high
tags:
- ui
- chat
- ux
created_at: 2026-06-11T11:04:25.157567820Z
updated_at: 2026-06-11T20:33:54.280759148Z
completed_at: 2026-06-11T20:33:54.280759148Z
transitions:
- status: in-progress
  at: 2026-06-11T11:05:11.476824903Z
- status: complete
  at: 2026-06-11T20:33:54.280759148Z
---

# Transcript Chat Flow

> **Status**: planned · **Priority**: high · **Created**: 2026-06-11

## Overview

The left panel currently keeps a single `currentComponent` plus a separate,
condensed `ChatHistory` summary of past answers. This causes three UX problems:

1. **Ward asked twice.** After the ward dropdown is answered,
   `selectNextComponent` runs a slow LLM call with **no loading feedback** and
   the ward dropdown still showing and interactive — so it looks like it is
   re-asking the ward.
2. **Unclear summaries.** `ChatHistory` re-derives each answer into a terse
   `Q:/A:` line that doesn't always read clearly.
3. **Poor scrolling.** Two stacked scroll regions (history list + active
   component, each `h-full min-h-0`) fight each other.

**Goal:** replace the single-component + summary model with one continuous
**transcript** that reads like a chat. Each question's *original widget* stays
in place (greyed-out + disabled once answered, with the chosen answer still
visible), the next question appends at the bottom, a loading bubble shows while
the next question compiles, and the whole thing scrolls as one list.

## Design

### Principles
- A single persisted `steps` array is the source of truth for what is on
  screen. No separate summary component.
- Each step renders its **own** widget from data + the captured raw answer, so
  answered selections survive a page reload (not just within a session).
- `userResponses` (consumed by the right panel + LLM) is **derived** from the
  locked steps — the LLM contract and candidate ranking are untouched.
- Widgets are frameless and stack contiguously inside one outer card so the
  panel reads as one chat thread.

### Data model (`src/types`)
```ts
// Raw, per-type answer captured at submit time (serialisable for persistence).
type RawAnswer =
  | { kind: "dropdown"; id: string; label: string }
  | { kind: "multiselect"; ids: string[]; labels: string[] }
  | { kind: "slider"; value: number }
  | { kind: "yesno"; responses: ("agree" | "disagree" | "skip")[] }
  | { kind: "freetext"; text: string }
  | { kind: "chat"; text: string };

interface TranscriptStep {
  id: string;               // stable React key, never changes
  component: ComponentData;
  locked: boolean;          // true once answered → greyed + disabled
  answer?: RawAnswer;       // present iff locked
  response?: UserResponse;  // the derived UserResponse for this step
}
```

The active step is the last step with `locked === false`. A boolean
`isCompiling` (component-level state) drives the loading bubble shown after the
active step while the next component is being fetched.

### Components

#### `src/components/dynamic/Transcript.tsx` (new)
- Maps `steps` → for each, render the question text + `ComponentRenderer`
  (locked ones disabled/greyed via `locked` prop).
- Renders a loading bubble after the last step when `isCompiling`.
- Holds the scroll container; auto-scrolls to the newest step / loading bubble
  on change (single `messagesEndRef` + `scrollIntoView`).

#### The 6 widgets (dropdown / multiselect / slider / yesno / freetext / chat)
- Remove the per-widget `<Card>` frame and the `h-full mx-auto max-w-*`
  fill styling — they become natural-height, full-width transcript rows.
- Add two optional props:
  - `value?: RawAnswer` → initialise displayed selection from a given answer.
  - `locked?: boolean` → non-interactive, greyed styling, no Submit button.
- On submit, report the **raw** answer alongside the existing formatted string
  so `page.tsx` can store it in the step (`onResponse(formatted, raw)`).
  `ComponentRenderer` forwards both. Existing `value` (formatted string) stays
  the UserResponse value the LLM consumes — unchanged.

#### `src/app/page.tsx`
- Replace `currentComponent` + persisted `userResponses` rendering with a
  single persisted `steps` array (`session:steps`).
- Derive `userResponses` (via `useMemo`) from locked steps for the right panel
  and `sendMessage`.
- `handleComponentResponse(raw, formatted)`:
  1. lock the active step + store `answer`/`response`,
  2. set `isCompiling = true`,
  3. run the ward branch or `sendMessage` branch (same as today),
  4. append the new active step from the result, `isCompiling = false`.
  Both branches funnel through one append path → no duplicate ward.
- Keep ward init / reset logic, but they now seed `steps` with the ward step.

### Removed
- `src/components/dynamic/ChatHistory.tsx` is deleted. `extractQuestionText`
  moves to a small shared util (`src/lib/...` or `Transcript.tsx`) since
  `page.tsx` still needs it for the derived `UserResponse.question`.

### Out of scope
- No changes to prompt templates, candidate ranking, or the right panel
  internals (beyond receiving the derived `userResponses`).
- No AI conversational-message bubble between steps (kept minimal per design).
- No editing of past answers.

## Plan

- [x] Add `RawAnswer` + `TranscriptStep` types in `src/types`.
- [x] Relocate `extractQuestionText` → `src/lib/client/extract-question-text.ts`.
- [x] Update `ComponentRendererProps` type (`value`/`locked` props,
      `onResponse(formatted, raw)` signature) in `src/types/components.ts`.
- [x] Update each widget: frameless, `value`/`locked` props, raw-answer report.
      - [x] `DropdownSelect`
      - [x] `FreeTextInput`
      - [x] `MultiSelectChecklist`
      - [x] `QuantitativeSlider`
      - [x] `YesNoQuestion`
      - [x] `ChatInterface` (single-turn: input when active, user's text when locked)
- [x] Update `ComponentRenderer` to forward `value`/`locked` and wire raw answers
      (incl. chat: `onSendMessage` → `onResponse(text, {kind:"chat",text})`).
- [x] Create `Transcript.tsx` (list render + loading bubble + autoscroll).
- [x] Rework `page.tsx` to `steps` model + derived `userResponses` + `isCompiling`.
- [x] Delete `ChatHistory.tsx`.
- [x] Fix up tests/imports referencing removed pieces; run lint + test + build.

### Progress notes (2026-06-11)

**Done:**
- `src/types/index.ts` — added `RawAnswer` (discriminated by `kind`) and
  `TranscriptStep` interface.
- `src/lib/client/extract-question-text.ts` — new pure util (also handles
  `slider` `label` now, in addition to `question`/`prompt`/yesno statements).
- `src/types/components.ts` — `ComponentRendererProps.onResponse` now
  `(response, raw?)`; added `locked?` and `value?: RawAnswer`.
- 4 widgets rewritten frameless (no `<Card>`, no `h-full/mx-auto/max-w`,
  natural height): each takes `locked` + `value`, initialises its state from
  `value`, hides its submit button when `locked`, and reports the raw answer as
  the 2nd `onResponse` arg. The formatted string (1st arg, LLM-consumed) is
  unchanged.

**Next up (resume here):**
1. `YesNoQuestion.tsx` — frameless, init `responses` from
   `value.kind==="yesno"`, disable buttons + hide Submit when `locked`, report
   `{kind:"yesno", responses}`. Keep the inner per-statement cards but drop the
   outer Card.
2. `ChatInterface.tsx` — simplify to single-turn for the transcript: active =
   input box (+ optional followup chip); `locked` = show the user's typed text
   read-only. Drop the global messages-list UI (useChat still tracks messages
   internally for the LLM; UI history now lives in the transcript). On submit
   call `onResponse(text, {kind:"chat", text})`.
3. `ComponentRenderer.tsx` — forward `locked`/`value`; for `chat` wrap
   `onSendMessage={(msg)=>onResponse(msg,{kind:"chat",text:msg})}`.
4. `Transcript.tsx` (new) — scroll container; map `steps` → `ComponentRenderer`
   (locked ones greyed via `opacity-60` + `pointer-events-none`), divider
   between steps, loading bubble after last step when `isCompiling`, single
   `messagesEndRef` + `scrollIntoView` on change.
5. `page.tsx` — replace `currentComponent` + the chat-sync effect with a
   persisted `session:steps` (`TranscriptStep[]`). Derive `userResponses` via
   `useMemo` from locked steps. `handleComponentResponse(response, raw)`:
   lock the active (last) step + attach `answer`/`response`, set
   `isCompiling`, run ward branch (`selectNextComponent`) or general branch
   (`sendMessage`) with the freshly-derived history, append the new active
   step, clear `isCompiling`. Always append a fallback chat step if no
   `nextComponent` so an active step always exists. Update `handleReset` to
   re-seed the ward step into `steps`. Remove now-unused
   `userResponsesRef`/`handleUndo` if they no longer apply.
6. Delete `src/components/dynamic/ChatHistory.tsx`.
7. Verify: `bun run lint`, `bun run test`, `bun run build`. e2e
   (`tests/e2e/chat-flow.spec.ts`) should still pass under `AI_MODE=mock`
   (locked widgets have no extra "Continue" buttons, so its selectors hold).

**Watch out:**
- Stable React keys per step (`step.id`) so a step is **not** remounted when it
  transitions active→locked (preserves within-session state; `value` covers
  reload).
- Migration: new `session:steps` key; old `session:currentComponent` /
  `session:userResponses` sessions just re-init at the ward step (acceptable).

## Test

- [x] **Ward locks.** Pick a ward → it greys out, keeps the chosen ward
  visible, and a loading bubble shows while the next question compiles.
  *(Verified via screenshot: greyed "Albany Ward" dropdown, no button.)*
- [x] **No duplicate ward.** Ward is never re-shown as active after answering.
  *(e2e: ward advances straight to the next component.)*
- [x] **Append below.** Each new question appears at the bottom; prior widgets
  remain greyed-out above it. *(Verified via screenshots.)*
- [x] **Contiguous look.** No per-widget card frames; reads as one chat.
  *(Verified via screenshot — single outer card, dividers between steps.)*
- [~] **Reload restores.** Implemented via `value` (raw answer persisted on each
  locked step) — not yet manually exercised; needs a quick manual refresh.
- [x] **Scroll.** Newest step / loading bubble is scrolled into view.
  *(Screenshot 3 shows the transcript auto-scrolled to the active step.)*
- [x] **LLM unaffected.** Derived `userResponses` passed to `sendMessage`
  includes the just-answered step (built synchronously from `lockedSteps`).
- [x] `bun run test` (57 unit), `tsc --noEmit`, `bun run build`, and
  `bun run test:e2e` (3 mock e2e) all pass. Biome clean on changed files.

## Notes

- Consolidates the concerns from spec 007 (which simplified `ChatHistory`)
  by removing the summary entirely in favour of a live transcript.
- Migration: introduces a new `session:steps` key; old `session:currentComponent`
  / `session:userResponses` sessions simply re-init at the ward step.
</content>
</invoke>
