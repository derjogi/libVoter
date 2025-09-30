# Requirements vs. current state

This document captures the **product intent** as the maintainer described it
and grades how much the current implementation already supports it. Each row
ends with a concrete change list. Treat this as the migration spec for
moving from "Auckland 2025 wards" → "NZ 2026 national + future elections,
including parties".

## Product intent (canonical)

A voting advisor that:

1. Helps users decide who to vote for in an **impartial, bias-reduced** way.
2. Holds rich candidate / **party** data: official bio + political statements
   today, plus (eventually) recent actions, history, areas of strength and
   weakness.
3. Guides the user through a **variable number of adaptive questions** in
   different UI formats — free-form when the user's preferences are vague,
   more controlled (ranking, multi-choice, sliders…) as we narrow down.
4. AI usually picks the next question type; for mass adoption a **static
   fallback** path should also work.
5. Stops asking once **≤3 candidates / parties remain** as plausible
   matches — i.e. confidence is measured by remaining ambiguity, not just
   by interaction count.
6. Is **flexible across elections**: NZ 2026 national first (parties +
   electorate candidates, MMP two-vote system), local Auckland-style ward
   elections again later, and ideally other countries down the road.

## Grading legend

- ✅ Implemented and roughly fits.
- 🟡 Partially implemented or implemented in a way that won't scale.
- ❌ Missing entirely.

---

## 1. Impartiality / bias reduction — 🟡 (deferred)

**Status:** Out of scope for now. The maintainer will add bias-reduction
mechanisms later. Today's prompt templates ask the LLM to "remain neutral"
but there is no enforcement — that is acknowledged technical debt, not an
immediate work item.

## 2. Candidate / party data model — 🟡

**Today:** [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) has three tables:

```ts
candidates(id, name, party TEXT, ward TEXT NOT NULL, candidate_statement,
           key_positions JSON, why, key_skills, top_issues,
           supporting_links JSON, photo_url, created_at)
parties(id, name, description, platform_data JSON, created_at)
app_settings(id, key, value, updated_at)
```

Issues for a national / multi-election world:

- **`ward TEXT NOT NULL`** is a hard assumption. NZ national elections use
  **electorates** + party list seats. Wards/electorates/districts are
  the same idea — but the column name leaks the original use case.
- **`party` is just text** on the `candidates` table — there is no FK to
  `parties`, no unique constraint, no per-election affiliation. The
  `parties` table exists but is never written to.
- **No election table** — only one election can live in the DB at once.
  Switching between Auckland 2025 and NZ 2026 means wiping the DB.
- **No history / activity / news fields** — the original spec had
  `experience[]` and `socialMedia` in the type system but nothing landed
  in the DB. There is no place for voting record, news mentions,
  controversies, or "where they're strong / weak".
- **MMP-specific concept missing**: candidates can run in an electorate AND
  be on a party list with a list rank. The model needs both.

**What to change:**

```diagram
╭─────────────╮  1───n  ╭─────────────╮  1───n  ╭───────────────╮
│  elections  │────────▶│   races     │────────▶│  candidacies  │
│  id, name,  │         │ id,         │         │ id, election, │
│  country,   │         │ election_id,│         │ race_id,      │
│  date,      │         │ kind        │         │ candidate_id, │
│  type       │         │ ('mayor'|   │         │ party_id,     │
│  config     │         │  'ward'|    │         │ list_rank?    │
╰─────────────╯         │  'electorate'│        ╰───────────────╯
                        │ |'list'),   │                ▲
                        │ name        │                │ n──1
                        ╰─────────────╯                │
                                                ╭───────────────╮
                        ╭─────────────╮         │  candidates   │
                        │   parties   │  1───n  │ id, name,     │
                        │ id, name,   │────────▶│ bio, photo,   │
                        │ leader,     │         │ socials,      │
                        │ platform,   │         │ activity[],   │
                        │ election_id │         │ history[]     │
                        ╰─────────────╯         ╰───────────────╯
```

Concrete schema work:

- New `elections(id, country, region, year, kind, config_json)` table.
- New `races(id, election_id, kind, name, district)` table — ward, mayor,
  electorate, list, etc.
- Rename / generalise `candidates.ward` → `candidates.region` (nullable),
  push the actual seat into `races`, and link via a new `candidacies`
  table (so one person can run in multiple races, or appear on a list).
- Promote `parties` to a real entity, add FK from `candidacies.party_id`,
  add per-election `manifestos` text/JSON.
- Add `activity` and `history` JSON arrays (or separate `events` table) on
  `candidates` and `parties` — schema today has nowhere to put news,
  voting history, controversies, recent statements.

A migration path: add the new tables alongside the existing ones, write a
small Bun script to backfill `elections`/`races`/`candidacies` from the
current Auckland rows, then deprecate `candidates.ward`.

## 3. Adaptive multi-format questioning — 🟡

**Today:** Six component types
([`src/components/dynamic/`](../src/components/dynamic)) wired through
[`ComponentRenderer.tsx`](../src/components/dynamic/ComponentRenderer.tsx).
The AI selects the next type via the `COMPONENT_SELECTOR` prompt
([`src/lib/server/prompts/index.ts`](../src/lib/server/prompts/index.ts)).
Conceptually right; gaps:

- **No ranking component** (the user's spec mentions ranking explicitly).
  Add a sortable list component.
- **No "zoom-in / zoom-out" signal** in state. The flow is essentially
  linear. To support widening when the user looks decided about the wrong
  thing, the LLM needs to see "remaining candidate set size" plus "topic
  coverage" and have an explicit verb in `COMPONENT_SELECTOR`:
  `narrow_down` | `broaden` | `confirm` | `summarise`.
- **No validation** of LLM output → broken auto-generated components are a
  major reported pain. Add Zod schemas matching each `*Data` type and
  fall back to a generic chat prompt on parse failure.
- **No memory of which topics have been covered**. Add a tracked
  `coveredTopics: Set<string>` in state and feed it into prompts so the
  selector stops asking about the same axis.

## 4. AI-driven question selection vs. static fallback — ❌ → deferred

**Status:** Out of scope. AI-only selection is fine for the foreseeable
future. Revisit only if mass-adoption / cost pressure forces it.

## 5. Confidence-driven progress, no hard stop — 🟡

**Today:** [`confidence-calculator.ts`](../src/lib/server/ai/confidence-calculator.ts)
mixes response quality, topic coverage, consistency, interaction count.
"Show candidates" triggers when `confidence ≥ AI_CONFIDENCE_THRESHOLD` AND
`responses ≥ MIN_INTERACTIONS_BEFORE_RESULTS`. The candidate set is **not**
actually re-ranked during the conversation.

**What to change (per maintainer's scoping):**

- Keep going as long as the user wants — **no hard stop at N candidates**.
- The confidence number should reflect **how confident we are in the
  current ranking of candidates / parties**, not just "how many questions
  did the user answer".
- Re-rank candidates after every turn (RAG-driven) so the right panel
  always shows the current best matches with up-to-date confidence.
- Track a `coveredTopics` set against `electionConfig.keyTopics`. When all
  topics are covered AND confidence is high, the AI may *suggest* the user
  has answered enough — but the user always has the final say.
- Add a clear UI affordance: a "I'm ready to decide" button always visible
  on the right panel, plus a "Keep asking me" button. The user is in
  charge of when to stop.

## 6. Multi-election flexibility — 🟡 (schema, not config)

**Status (per maintainer's scoping):** A hard-coded `electionConfig`
[`src/lib/config/election.ts`](../src/lib/config/election.ts) is fine for
now. The real requirement is that **the database schema and the rest of
the runtime can describe any election**, so switching from Auckland 2025
to NZ 2026 (and back, or to another country later) is a data migration —
not a code rewrite of the data model.

**What to change:**

- Make `ElectionConfig` slightly richer so the right things end up in
  prompts:
  ```ts
  interface ElectionConfig {
    id: string;                       // 'nz-2026'
    country: string;                  // 'NZ'
    region?: string;                  // 'Auckland' (sub-national)
    year: number;
    type: 'national' | 'local' | 'regional' | 'referendum';
    votingSystem: 'fpp' | 'mmp' | 'stv' | 'preferential';
    seatTypes: Array<'mayor' | 'ward' | 'electorate' | 'list' | 'councillor'>;
    keyTopics: string[];
    description: string;
  }
  ```
- The hard-coded `ward = 'Mayor'` carve-out in
  [`actions/database.ts`](../src/lib/actions/database.ts#L132-L146) becomes
  a generic "filter by race kind" query. The frontend currently hardcodes a
  ward dropdown; replace with a generic "what's your seat?" prompt that
  reads from `races` for the active election.
- Configs can be added later as a registry; for now one global
  `electionConfig` constant per deployment is enough.

## 7. NZ 2026 specifically — what needs to land first

To stand the app up for NZ 2026:

1. **Schema migration** to add `elections`, `races`, `parties`,
   `candidacies` tables and migrate the Auckland data into them (one-off
   Bun script).
2. **Election config** for `nz-2026` (`votingSystem: 'mmp'`, two seat
   types: `electorate` + `list`).
3. **Onboarding question replacement**: instead of the ward dropdown,
   ask the user for their **electorate** (there are ~72 — a long
   searchable dropdown is fine; same component, different data source).
4. **Two parallel matches**: one for *party vote*, one for *electorate
   vote*. The right panel grows a tab for each, since under MMP these are
   independent decisions.
5. **Candidate / party scraper for NZ 2026**. Likely sources:
   - electoral commission (`elections.nz`) for candidate lists per
     electorate and party lists.
   - party manifestos from each party site.
   - Hansard / news scraping for "recent actions" (deferred, big task).

   The current scraper
   ([`scripts/scrape-candidates.ts`](../scripts/scrape-candidates.ts)) is
   tightly coupled to `voteauckland.co.nz`; refactor into a small plugin
   interface so each election supplies its own scraper:
   ```ts
   interface ElectionScraper {
     listCandidates(): Promise<RawCandidate[]>;
     listParties(): Promise<RawParty[]>;
   }
   ```

6. **Prompts updated**: `COMPONENT_SELECTOR`, `EXPLAIN_MATCH`, etc.
   currently hard-code `electionWards`. Generalise to `electionSeats` /
   `electionDistricts`, and the prompt manager passes whichever the
   election uses.

## 8. Where existing code already helps

A surprising amount of the current code generalises cleanly:

- The **dynamic component framework** (`ComponentRenderer` + six
  `*Data` interfaces) is already election-agnostic.
- **PromptManager** already templates election variables — adding new
  variables is a small, central edit.
- **RAG over Chroma** is candidate-agnostic; it just needs richer
  document content (party manifestos, voting history) and metadata
  (`election_id`, `race_id`).
- **HuggingFace embeddings** keep cost flat regardless of corpus size,
  which matters more for a national election (~500+ candidates + 16+
  parties + manifestos).

---

## Suggested ordering of changes

```diagram
1. Fix AIChatHandler.processMessage (currently throws — see AGENTS.md)
2. Schema generalisation (elections, races, parties, candidacies)
3. NZ 2026 scraper + initial data load
4. Generalise UI bootstrap (electorate selection instead of ward)
5. Add Zod validation around every LLM JSON parse
6. Confidence-driven progress + "I'm ready to decide" UI affordance
7. Mock AI mode for free CI tests (AI_MODE=mock|live)
8. (Deferred) Source-attribution + bias-guard in EXPLAIN_MATCH
9. (Deferred) Static-flow fallback for mass adoption
10. (Stretch) Activity/history ingestion for candidates and parties
```

Specs 1–6 are tracked in [`specs/`](../specs). Items 8–10 are on the
maintainer's "later" pile.
