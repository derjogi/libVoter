# Evidence Identity and Detail Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrieve candidate evidence with the correct person identity, preserve candidate-versus-party provenance, and expose full cited evidence in candidate and party detail modals.

**Architecture:** Candidate views carry explicit candidacy, person, and party IDs. Ranking stays candidacy-scoped, while current Chroma personal retrieval filters by person ID and party retrieval filters by stored party ID. Match contracts preserve evidence lanes and statuses through to separate modal sections; retrieval failures degrade per lane without removing ranked cards.

**Scope:** This plan implements identity, provenance, citations/excerpts, and detail presentation. It does not implement Phase 6's future gated per-shortlist summary generation or party-summary cache, and it must not mark Phase 6 or the umbrella spec complete.

**Tech Stack:** TypeScript, Next.js/React 19, libSQL/Drizzle, LangChain Chroma, shadcn Dialog, Vitest, happy-dom, Bun, Jujutsu.

---

## File responsibility map

- `src/types/index.ts`: application identity and evidence-result contracts.
- `src/lib/server/election-data.ts`: joins candidacy/person/party records into candidate views.
- `src/lib/server/rag/query-engine.ts`: independently retrieves personal and party evidence with lane status.
- `src/lib/server/ai/chat-handler.ts`: ranks by candidacy, retrieves by person/party, and maps chunks to separate citations.
- `src/lib/client/candidate-match.ts`: initializes evidence lanes/statuses before ranking.
- `src/components/candidates/CandidateCard.tsx`: displays total available citation count.
- `src/components/candidates/CandidateModal.tsx`: renders candidate and party evidence separately.
- `src/components/candidates/PartyList.tsx`: exposes party-card selection.
- `src/components/candidates/PartyModal.tsx`: renders full party reasoning and citations.
- `src/components/layout/RightPanel.tsx`: owns candidate/party modal selection state.
- Existing tests under `tests/unit/`: repository, retrieval/ranking, and modal interaction regressions.

Do not modify or commit unrelated working-copy changes in `.superpowers/brainstorm/**`, `data/elections/nz-2026.db`, `scripts/ingest-sources.ts`, or `src/lib/server/ingestion/runner.ts`. Before every commit, run `jj status`; every `jj commit` below must use only its explicit fileset.

### Task 1: Make candidate identity explicit and fix personal retrieval

**Files:**
- Modify: `src/types/index.ts:92-105`
- Modify: `src/lib/server/election-data.ts:85-135`
- Modify: `src/lib/server/rag/query-engine.ts:17-64`
- Modify: `src/lib/server/ai/chat-handler.ts:414-590`
- Modify: `src/lib/actions/rag.ts`
- Modify: `scripts/verify-setup.ts`
- Modify: `tests/unit/election-data.test.ts`
- Modify: `tests/unit/chat-handler.test.ts`
- Modify: `tests/unit/party-matching.test.ts`
- Modify: `tests/unit/ranking-confidence.test.ts`

- [ ] **Step 1: Write repository identity regressions**

Update the generic repository test to require the joined identities:

```ts
expect(candidates[0]).toMatchObject({
  candidacyId: "candidacy-1",
  personId: "person-1",
  partyId: "party-1",
});
```

Insert `party-1` into `election_parties` and assign it to the generic candidacy before asserting all three IDs. Update the legacy test to require its compatibility projection (`candidacyId` and `personId` both equal `"7"`; `partyId` is `null`). Never infer a legacy party ID from display text.

- [ ] **Step 2: Add and directly verify a person-owned mock fixture**

Add a mock chunk owned by `person-green`, then extend `rag-retrieval.test.ts` to query the engine directly with `personId: "person-green"`. Run that one test and require PASS, proving the fixture and query engine can retrieve by person ID before testing the chat-handler call site.

- [ ] **Step 3: Write the retrieval-ID regression**

Extend the mock candidate helper with distinct IDs and assert ranking identity and evidence identity do not collide:

```ts
const match = result.candidateMatches[0];
expect(match.candidate.candidacyId).toBe("candidacy-green");
expect(match.candidate.personId).toBe("person-green");
expect(match.candidate.partyId).toBe("nz-2026-party-green");
expect(match.candidateSources[0]?.title).toBe("Greta Green — candidate statement");
```

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
bun run test tests/unit/election-data.test.ts tests/unit/rag-retrieval.test.ts tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/ranking-confidence.test.ts
```

Expected: repository assertions fail because `Candidate` lacks explicit IDs; after those compile, the chat-handler assertion fails specifically because personal retrieval receives the candidacy ID while the direct query-engine test is already green.

- [ ] **Step 5: Implement explicit identity fields without breaking intermediate callers**

Add explicit fields while temporarily retaining a deprecated compatibility alias:

```ts
/** @deprecated Use candidacyId. */
id: string;
candidacyId: string;
personId: string;
partyId: string | null;
```

Select `c.id AS candidacy_id`, `c.person_id`, and `c.party_id` in the generic repository. Project legacy IDs deliberately rather than guessing modern identifiers. Set `id` equal to `candidacyId` only for compatibility until Task 3 migrates all remaining callers.

- [ ] **Step 6: Retrieve with stored evidence-owner IDs**

Change `retrieveForCandidate` to accept a named object instead of ambiguous positional IDs:

```ts
retrieveForCandidate(query, {
  personId: candidate.personId,
  partyId: candidate.partyId ?? undefined,
  electionId: electionConfig.id,
});
```

Remove `partyEvidenceId()` and all party-name slug reconstruction. Key returned evidence maps by `candidacyId`. Migrate `src/lib/actions/rag.ts` and `scripts/verify-setup.ts` to the named identity object and rename public/internal parameters from ambiguous `candidateId` to `personId` where they target the legacy Chroma personal-evidence filter.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 4 command. Expected: PASS.

- [ ] **Step 8: Audit and commit the identity fix**

```bash
jj status
jj commit src/types/index.ts src/lib/server/election-data.ts src/lib/server/rag/query-engine.ts src/lib/server/rag/vector-store.ts src/lib/server/ai/chat-handler.ts src/lib/actions/rag.ts scripts/verify-setup.ts tests/unit/election-data.test.ts tests/unit/rag-retrieval.test.ts tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/ranking-confidence.test.ts -m "Fix candidate evidence identity"
jj show @- --stat
```

### Task 2: Preserve evidence provenance and add party evidence retrieval

**Files:**
- Modify: `src/types/index.ts:125-167`
- Modify: `src/lib/server/rag/query-engine.ts`
- Modify: `src/lib/server/ai/chat-handler.ts:414-641`
- Modify: `src/lib/client/candidate-match.ts:38-66`
- Modify: `src/lib/server/rag/vector-store.ts` (mock fixtures only unless a production metadata mapping change is required)
- Modify: `tests/unit/chat-handler.test.ts`
- Modify: `tests/unit/party-matching.test.ts`
- Modify: `tests/unit/rag-retrieval.test.ts`

- [ ] **Step 1: Write failing provenance tests**

Require separate match fields and statuses:

```ts
expect(match.candidateSources.map((source) => source.title)).toContain(
  "Greta Green — candidate statement",
);
expect(match.partySources.map((source) => source.title)).toContain(
  "Green — party platform (Wikipedia)",
);
expect(match.candidateEvidenceStatus).toBe("available");
expect(match.partyEvidenceStatus).toBe("available");
```

Require `PartyMatch.sources` to contain the stored party-ID citation. Use a party fixture whose ID cannot be reconstructed from its display name to prove no slug fallback exists.

- [ ] **Step 2: Add the minimal retrieval injection seam**

Export `EvidenceVectorStore` and let `RAGQueryEngine` accept an optional store loader, defaulting to `getVectorStoreManager`. Tests pass a deterministic fake without mutating the module singleton:

```ts
new RAGQueryEngine(async () => fakeStore);
```

Also let `AIChatHandler` accept an optional RAG-engine factory while preserving
its zero-argument production constructor:

```ts
constructor(private readonly createRagEngine = () => new RAGQueryEngine())
```

Tests can then inject an engine whose per-person/per-party calls deterministically
resolve or reject. This is infrastructure for the failing behavior tests, not
the fix itself.

- [ ] **Step 3: Write failing deduplication and degradation tests**

Add overlapping chunks sharing an `evidenceId` and assert one citation survives with the highest reliability and excerpt. Add query-engine tests for successful-empty and rejected personal/party lanes using the injected fake. Add a two-candidate regression where one candidate's evidence fails but both cards remain, and a multi-party regression where one party's evidence fails but all party matches remain.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
bun run test tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/rag-retrieval.test.ts
```

Expected: FAIL because candidate citations are merged, party ranking emits no citations, and statuses do not exist.

- [ ] **Step 5: Add typed lane statuses and independent retrieval**

Add:

```ts
export type EvidenceStatus = "available" | "empty" | "unavailable";
```

`CandidateMatch` receives `candidateSources`, `partySources`, `candidateEvidenceStatus`, and `partyEvidenceStatus`. `PartyMatch` retains `sources` and adds `evidenceStatus`. Use independently settled retrieval calls so failure in one lane does not discard the other lane or ranked cards.

Implement per-lane settling inside `RAGQueryEngine` and return status with each lane. Ensure each candidate and each party retrieval resolves to available/empty/unavailable data rather than rejecting aggregate ranking. Keep LLM ranking independent from evidence retrieval so evidence failure never returns an empty match list.

- [ ] **Step 6: Carry excerpts and deduplicate citations per lane**

Extend `Source` with `evidenceId?: string` and `excerpt?: string`. Map `CandidateEvidence.individual` only to `candidateSources` and `.party` only to `partySources`. Deduplicate first by `evidenceId`; fall back to canonical URL plus stable content identity. Preserve the highest-scoring occurrence and its excerpt. Test both duplicate evidence IDs and same-URL distinct fallback passages.

- [ ] **Step 7: Retrieve standalone party evidence**

Add `retrieveForParty(query, partyId, electionId)` and call it from `rankParties`. Use `PartySummary.id` directly, keep ranking usable on retrieval failure, and attach only party-owned citations to `PartyMatch.sources`.

- [ ] **Step 8: Initialize unranked matches safely**

Set both source arrays to empty and statuses to `empty` in `toUnrankedMatch`; set party sources empty and status `empty` in `toUnrankedPartyMatch`.

- [ ] **Step 9: Run focused tests and verify GREEN**

Run the Step 4 command. Expected: PASS.

- [ ] **Step 10: Audit and commit provenance and party retrieval**

```bash
jj status
jj commit src/types/index.ts src/lib/server/rag/query-engine.ts src/lib/server/ai/chat-handler.ts src/lib/client/candidate-match.ts src/lib/server/rag/vector-store.ts tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/rag-retrieval.test.ts -m "Separate candidate and party evidence"
jj show @- --stat
```

### Task 3: Add separate candidate sections and clickable party details

**Files:**
- Modify: `src/components/candidates/CandidateCard.tsx`
- Modify: `src/components/candidates/CandidateModal.tsx`
- Modify: `src/components/candidates/PartyList.tsx`
- Create: `src/components/candidates/PartyModal.tsx`
- Modify: `src/components/layout/RightPanel.tsx`
- Modify: `src/components/candidates/ComparisonView.tsx`
- Create: `tests/unit/right-panel-evidence.test.ts`
- Modify: `tests/e2e/chat-flow.spec.ts`

- [ ] **Step 1: Write a focused failing PartyModal contract test**

Using `@vitest-environment happy-dom`, render an open `PartyModal`, query `document.body` because Radix portals dialog content, and require the title, full reasoning, excerpt, source link, and empty/unavailable status copy. First run a minimal open/close smoke assertion to validate Radix works in this environment; if the portal itself cannot render in happy-dom, keep content tests at a pure component boundary and move Dialog behavior to Playwright.

- [ ] **Step 2: Write a separate failing RightPanel wiring test**

Using `@vitest-environment happy-dom` and the existing `createRoot`/`act` pattern, render `RightPanel` with one candidate and one party. Assert:

```ts
expect(container.textContent).not.toContain("Full party explanation");
partyCard.click();
expect(container.textContent).toContain("Full party explanation");
expect(document.body.querySelector('a[href="https://example.test/party"]')).not.toBeNull();
```

Open the candidate modal and require distinct “Candidate evidence” and “Party evidence” headings, plus the candidate empty/unavailable message where appropriate.

- [ ] **Step 3: Run the component tests and verify RED**

Run:

```bash
bun run test tests/unit/right-panel-evidence.test.ts
```

Expected: the PartyModal contract test fails because the component does not exist; after adding only the modal, the RightPanel test still fails because party cards have no selection callback/wiring and candidate sources are merged.

- [ ] **Step 4: Render candidate evidence sections**

Update candidate source counts to sum both lanes. In `CandidateModal`, render `candidateSources` under “Candidate evidence” and `partySources` under “Party evidence”. Render excerpts plus distinct messages for `empty` and `unavailable`; source links retain external-link safety attributes.

- [ ] **Step 5: Add the matching party modal**

Create `PartyModal` with the approved candidate-modal interaction: party name/leader, match score, full untruncated reasoning, cited excerpts, evidence empty/unavailable state, and Close action. Use the existing shadcn `Dialog` components, associated `DialogTitle`, and responsive max-height behavior.

- [ ] **Step 6: Wire party selection through the right panel**

Add `onSelectParty` to `PartyList`; render each selectable card inside a native `<button type="button">` with `cursor-pointer` and an explicit accessible label, relying on native Enter/Space behavior rather than custom key handlers. Store `selectedParty` in `RightPanel` and render `PartyModal` alongside `CandidateModal`.

- [ ] **Step 7: Migrate remaining candidacy callers and remove the alias**

Use `candidate.candidacyId` in `CandidateList`, `ComparisonView`, `RightPanel`, ranking tests, and every remaining application caller. Do not use `personId` for ballot-card identity. Run `rg -n "candidate\\.id" src tests/unit`; when no compatibility caller remains, remove deprecated `Candidate.id` and repository projection.

- [ ] **Step 8: Add focused browser accessibility coverage**

Extend the existing Playwright flow to open a party card with keyboard Enter and Space, assert the named dialog opens, press Escape to close, and verify focus returns to the triggering party button. Keep happy-dom focused on content and wiring rather than unsupported browser focus assumptions.

- [ ] **Step 9: Run component and related tests and verify GREEN**

Run:

```bash
bun run test tests/unit/right-panel-evidence.test.ts tests/unit/right-panel-summary.test.ts tests/unit/party-matching.test.ts tests/unit/chat-handler.test.ts
```

Expected: PASS.

- [ ] **Step 10: Audit and commit the detail UI**

```bash
jj status
jj commit src/types/index.ts src/lib/server/election-data.ts src/components/candidates/CandidateCard.tsx src/components/candidates/CandidateModal.tsx src/components/candidates/PartyList.tsx src/components/candidates/PartyModal.tsx src/components/candidates/CandidateList.tsx src/components/candidates/ComparisonView.tsx src/components/layout/RightPanel.tsx tests/unit/right-panel-evidence.test.ts tests/unit/election-data.test.ts tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/ranking-confidence.test.ts tests/e2e/chat-flow.spec.ts -m "Add candidate and party evidence details"
jj show @- --stat
```

### Task 4: Verify the integrated evidence path

**Files:**
- Modify if implementation discoveries require it: `specs/009-candidate-evidence-rag/README.md` (body only; never hand-edit frontmatter)

- [ ] **Step 1: Run all targeted unit tests**

```bash
bun run test tests/unit/election-data.test.ts tests/unit/chat-handler.test.ts tests/unit/party-matching.test.ts tests/unit/rag-retrieval.test.ts tests/unit/right-panel-evidence.test.ts tests/unit/right-panel-summary.test.ts tests/unit/ranking-confidence.test.ts
```

Expected: PASS with no unhandled React warnings.

- [ ] **Step 2: Run static verification**

```bash
bunx tsc --noEmit
bun run lint
bun run test
bun run build
AI_MODE=mock bunx playwright test tests/e2e/chat-flow.spec.ts
```

Expected: all exit 0. If build prerequisites or repository-wide lint fail for an unrelated pre-existing reason, run the narrow touched-file check and report the broader failure honestly; do not claim full verification.

- [ ] **Step 3: Verify live metadata ownership without rebuilding embeddings**

First verify the fixture IDs read-only:

```bash
sqlite3 data/elections/nz-2026.db "SELECT c.id, c.person_id, c.party_id FROM candidacies c JOIN people p ON p.id=c.person_id WHERE p.name='Candace Kinser';"
```

Then query the existing Chroma collection without writes:

```bash
AI_MODE=live bun -e 'const { RAGQueryEngine } = await import("./src/lib/server/rag/query-engine"); const result = await new RAGQueryEngine().retrieveForCandidate("local businesses Queen Street", { personId: "nz-2026-person-candace-kinser", partyId: "nz-2026-party-national", electionId: "nz-2026" }); console.log(JSON.stringify(result, null, 2));'
```

Expected: the personal lane contains Candace Kinser's National profile and the party lane contains only National-owned evidence. If Chroma or the fixture is unavailable, record verification as skipped with the exact reason; do not repopulate or claim PASS.

- [ ] **Step 4: Record implementation outcome if it differs from the design**

Update only the spec body with verified decisions or limitations. Keep spec 009 `in-progress` because this change does not complete the entire umbrella spec.

- [ ] **Step 5: Commit any necessary documentation update separately**

```bash
jj commit specs/009-candidate-evidence-rag/README.md -m "Document evidence detail implementation"
```

Skip this commit if no documentation changed.

- [ ] **Step 6: Audit commit boundaries and remaining working copy**

```bash
jj log -r 'ancestors(@, 5)' --stat
jj diff --summary
jj status
```

Confirm each implementation commit contains only its enumerated files and all unrelated `.superpowers/brainstorm/**`, database, and ingestion changes remain untouched.
