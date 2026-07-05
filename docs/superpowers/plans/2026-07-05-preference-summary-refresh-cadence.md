# Preference Summary Refresh Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce preference-summary LLM calls by building after three substantive answers and renewing only after two more answers or new free text.

**Architecture:** Put the cadence decision in a pure client utility so answer counting and free-text detection can be unit tested without rendering React. `RightPanel` will track the substantive-response count used for the most recent request, invoke the existing Server Action only when the utility says to, and preserve a completed summary while a renewal runs.

**Tech Stack:** TypeScript, React 19, Next.js 15, Vitest, Bun

---

### Task 1: Add the summary-refresh policy

**Files:**
- Create: `src/lib/client/preference-summary-refresh.ts`
- Create: `tests/unit/preference-summary-refresh.test.ts`

- [ ] **Step 1: Write failing policy tests**

Cover these behaviors with `UserResponse` fixtures:

- ward/electorate selection does not count;
- no request before three substantive answers;
- the third substantive answer requests the first summary;
- one ordinary answer after a request does not renew it;
- two ordinary answers after a request renew it;
- `chat` and `freetext` answers renew immediately after the initial threshold;
- free text before the initial threshold does not build early;
- a response count already requested does not request again.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test tests/unit/preference-summary-refresh.test.ts`

Expected: FAIL because `@/lib/client/preference-summary-refresh` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Export a substantive-response filter/count helper and a predicate accepting
the responses plus the substantive count used for the most recent summary
request. Treat only `chat` and `freetext` as free text; string-valued dropdowns
and other controls must not trigger immediate renewal.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test tests/unit/preference-summary-refresh.test.ts`

Expected: all policy tests pass.

### Task 2: Integrate the policy into `RightPanel`

**Files:**
- Modify: `src/components/layout/RightPanel.tsx`
- Modify: `tests/unit/preference-summary-refresh.test.ts`

- [ ] **Step 1: Add any missing failing policy case discovered during integration**

In particular, prove that an immediate free-text renewal resets the ordinary
two-answer interval by passing the latest requested substantive count back to
the predicate.

- [ ] **Step 2: Run the focused test and verify RED if a case was added**

Run: `bun run test tests/unit/preference-summary-refresh.test.ts`

Expected: the new edge case fails for the intended policy reason.

- [ ] **Step 3: Gate summary requests in `RightPanel`**

Track the substantive count at request start. Reset it when the session has no
substantive responses. Call `summarizeUserPreferences` only when the policy
predicate passes, while retaining the existing sequence guard against stale
responses.

- [ ] **Step 4: Preserve the old summary while renewing**

Render `Generating summary...` only for the initial build. During a renewal,
continue rendering the existing Markdown and add a quiet `Updating summary...`
status.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
bun run test tests/unit/preference-summary-refresh.test.ts
bun run test
bun run lint
```

Expected: all tests pass and Biome reports no errors.

### Task 3: Complete project tracking

**Files:**
- Modify: `specs/005-candidate-confidence-ui/README.md`

- [ ] **Step 1: Record implementation outcome**

Add a concise note describing the pure policy helper, `RightPanel` integration,
and verification commands.

- [ ] **Step 2: Commit the coherent implementation with Jujutsu**

Describe the change with `jj describe`, inspect `jj diff`, and start a new
empty working-copy change with `jj new`.
