# User flow

The app is a single page (`src/app/page.tsx`) split into two panels.

```diagram
┌──────────────────────────────────────────────────────────────────────────┐
│ Header: "AI Voting Advisor"        [Confidence: NN%]      [Reset]        │
├────────────────────────────────────┬─────────────────────────────────────┤
│ LEFT (dynamic input)               │ RIGHT (results)                     │
│  • <ComponentRenderer>             │  • <RightPanel>                     │
│      dispatches by component.type  │      ↳ <CandidateList> with         │
│      → ChatInterface               │        confidence-gated reveal,     │
│      → DropdownSelect              │        per-candidate match score    │
│      → MultiSelectChecklist        │        and AI-generated reasoning.  │
│      → YesNoQuestion               │  • Hidden until confidence > 30%    │
│      → FreeTextInput               │    OR shouldShowCandidates is true. │
│      → QuantitativeSlider          │                                     │
└────────────────────────────────────┴─────────────────────────────────────┘
```

On mobile (`<768px`) only one panel is visible at a time, toggled by a
floating "Questions / Candidates" pill.

## Step by step

```diagram
 ╭──────────────────────────╮
 │ 1. App loads             │  fetch wards via getSeatsForCurrentElection()
 │    → Seat dropdown shown │  (questionId = 'seat_selection')
 ╰────────────┬─────────────╯
              ▼
 ╭──────────────────────────╮
 │ 2. User picks seat       │  page.tsx handleComponentResponse:
 │    + clicks Continue     │   - getMayorCandidates() + getCandidatesForSeat(seat)
 │                          │   - build "available candidates" list
 │                          │   - call selectNextComponent(state)  ← LLM #1
 ╰────────────┬─────────────╯
              ▼
 ╭──────────────────────────╮
 │ 3. LLM picks next        │  Returns {component, reasoning, data}.
 │    component             │  Typical first follow-ups: yesno, multiselect,
 │                          │  or free chat — see PROMPTS.COMPONENT_SELECTOR.
 ╰────────────┬─────────────╯
              ▼
 ╭──────────────────────────╮
 │ 4. User answers          │  useChat.sendMessage → processChatMessage:
 │                          │   - ConfidenceCalculator.calculate()
 │                          │   - (intended) build LLM messages w/ RAG context
 │                          │   - chatModel.invoke()                ← LLM #2
 │                          │   - selectNextComponent() again       ← LLM #3
 │                          │   - if confidence < 70: generateFollowupQuestion ← LLM #4
 ╰────────────┬─────────────╯
              ▼
 ╭──────────────────────────╮
 │ 5. Loop on step 4 until  │  shouldShowCandidates =
 │    confidence threshold  │     confidence >= AI_CONFIDENCE_THRESHOLD
 │    AND interaction count │     && responses.length >= MIN_INTERACTIONS_BEFORE_RESULTS
 ╰────────────┬─────────────╯
              ▼
 ╭──────────────────────────╮
 │ 6. Right panel reveals   │  generateCandidateMatches() (when ≤3 candidates)
 │    candidates with scores│  calls explainCandidateMatch() per candidate ← LLM #5+
 │    and reasoning         │  Otherwise placeholder reasoning is used.
 ╰──────────────────────────╯
```

## State shape

Held in `page.tsx`:

| State                      | Source / purpose                                                  |
| -------------------------- | ----------------------------------------------------------------- |
| `currentComponent`         | The single `{type, data}` rendered on the left.                   |
| `userResponses`            | `UserResponse[]` accumulated for confidence + summary.            |
| `availableCandidates`      | Mayoral + selected-seat candidates, fetched once after step 2.    |
| `candidates`               | `CandidateMatch[]` shown on the right.                            |
| `confidence`               | 0–100, taken from the most recent AI response.                    |
| `showCandidates`           | Toggle for the right panel reveal.                                |
| `messages` (`useChat`)     | Full assistant/user transcript (currently only used by chat UI).  |

Nothing is persisted across reloads — the original spec mentioned
`localStorage` but the implementation does not save responses there yet
(this is one of the obvious "improve" items).

## Component contract

Each dynamic component receives `{type, data, onResponse, disabled,
isLoading}` and calls `onResponse(value)` when the user submits.
`ComponentRenderer` is the switch.

| Type          | Component file              | `data` shape (see `src/types/index.ts`)               |
| ------------- | --------------------------- | ----------------------------------------------------- |
| `chat`        | `ChatInterface.tsx`         | `{ messages, placeholder }`                           |
| `dropdown`    | `DropdownSelect.tsx`        | `{ question, options[], placeholder, questionId }`    |
| `multiselect` | `MultiSelectChecklist.tsx`  | `{ question, options[], maxSelections, questionId }`  |
| `yesno`       | `YesNoQuestion.tsx`         | `{ statements: [{ statement, context }] }`            |
| `freetext`    | `FreeTextInput.tsx`         | `{ prompt, placeholder, maxLength }`                  |
| `slider`      | `QuantitativeSlider.tsx`    | `{ label, min, max, step, unit, description }`        |

The `COMPONENT_SELECTOR` LLM prompt (in `src/lib/server/prompts/index.ts`)
embeds these exact data shapes so the model can synthesise valid component
specs on the fly.

## Failure modes you've already seen

- "Many auto-generated components don't quite work." Likely culprits:
  - LLM returns invalid JSON → `JSON.parse` falls back to `{component:'chat',
    placeholder:'…'}` (see `actions/prompts.ts`).
  - LLM returns extra fields the renderer ignores, or omits `options`/`statements`.
  - `yesno` data with empty `statements`, `multiselect` with zero `options`
    — components don't currently validate input.
- "It hangs." Two main causes:
  1. Cold-start of HuggingFace embeddings (one-time) plus a missing or empty
     Chroma evidence collection that needs offline embedding via
     `scripts/embed-evidence.ts`.
  2. Slow OpenRouter completions (20–90 s observed in `run.log`).
- The full chat path (post seat selection) crashes due to the
  `messages`/`candidates` issue in `chat-handler.ts` — see `SETUP.md`.
