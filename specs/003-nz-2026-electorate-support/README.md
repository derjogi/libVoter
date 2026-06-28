---
status: in-progress
created: 2026-05-03
priority: high
tags:
- election
- nz-2026
depends_on:
- '002'
created_at: 2026-05-03T01:39:17.284209764Z
updated_at: 2026-05-03T01:39:17.284209764Z
---

# NZ 2026 national election support (electorates + MMP party vote)

> **Status**: planned · **Priority**: high · **Created**: 2026-05-03

## Overview

The original codebase targets Auckland 2025 local council elections (wards
+ mayor). The next election the maintainer wants to support is **NZ 2026
General Election**, which is fundamentally different:

- **MMP (mixed-member proportional)**: every voter casts **two** votes —
  one for a *party* and one for an *electorate candidate*. These are
  independent decisions and the app should help with both.
- **~72 electorate seats** (instead of ~21 Auckland wards) plus list MPs
  who don't have an electorate but appear on a party's ranked list.
- **Parties are first-class**: voters often pick a party first, then ask
  who their local candidate is.
- **National scope**: candidate data comes from elections.nz, not
  voteauckland.co.nz.

Depends on spec 002 (the new `elections / races / parties / candidacies`
schema).

## Design

### Election config

Add `nz-2026` to [`src/lib/config/election.ts`](../../src/lib/config/election.ts)
using the richer `ElectionConfig` shape from `REQUIREMENTS_GAP.md`:

```ts
export const electionConfig: ElectionConfig = {
  id: 'nz-2026',
  country: 'NZ',
  year: 2026,
  type: 'national',
  votingSystem: 'mmp',
  seatTypes: ['electorate', 'list'],
  keyTopics: ['Cost of living', 'Housing', 'Health', 'Climate',
              'Treaty', 'Crime', 'Education', 'Transport'],
  description: 'New Zealand 2026 General Election — party vote + electorate vote (MMP)',
};
```

Switching elections is still a code edit (per maintainer scoping) — only
the **data** has to be re-loadable.

### Onboarding flow

Replace the ward dropdown with an **electorate dropdown** (~72 entries,
searchable). Generic enough that the same component renders both:
`races where election_id = current && kind in ('ward','electorate')`.

### Two parallel matches

The right panel grows two tabs (or two stacked sections on mobile):

```diagram
╭─ Right panel ────────────────────────╮
│ ┌─ Party vote ────────────────────┐  │
│ │ 1. Party A   72%   (reasoning)  │  │
│ │ 2. Party B   58%                │  │
│ │ 3. Party C   41%                │  │
│ └─────────────────────────────────┘  │
│ ┌─ Electorate vote ───────────────┐  │
│ │ 1. Candidate X  68%             │  │
│ │ 2. Candidate Y  55%             │  │
│ └─────────────────────────────────┘  │
╰──────────────────────────────────────╯
```

Both use the same matching pipeline; they differ only in the candidate
set fed in (`candidacies where race.kind = 'list'` vs.
`candidacies where race.district = userElectorate`).

### Scraper

The current scraper is hard-wired to `voteauckland.co.nz`. For NZ 2026
write a new file `scripts/scrape-nz-2026.ts` that pulls candidate lists
and party manifestos. Likely sources:

- `elections.nz` (electoral commission) for candidate lists per
  electorate and party lists.
- Each party's website / manifesto page for platform text.
- (Stretch) Hansard for recent activity — defer to spec 010-ish.

We don't need a full plugin abstraction yet; one new script per election
is fine. Common helpers (DB upsert, RAG repopulate) can stay shared.

## Plan

- [ ] Add `nz-2026` config to `electionConfig` (or replace the Auckland
      one — only one runs at a time).
- [ ] Confirm the spec-002 schema can express electorates + list seats;
      if not, extend.
- [ ] Generalise prompts in
      [`src/lib/server/prompts/index.ts`](../../src/lib/server/prompts/index.ts)
      so `electionWards` becomes `electionSeats` (or similar) and works
      for both ward and electorate language.
- [ ] Replace the hard-coded ward dropdown bootstrap in
      [`src/app/page.tsx`](../../src/app/page.tsx) with a generic
      "select your seat" dropdown that reads from `races`.
- [ ] Write `scripts/scrape-nz-2026.ts` (Playwright). Outputs into the
      new schema (election_id='nz-2026'). Keep the scraper headed for
      dev; make it parameterisable for headless CI later.
- [ ] Two-vote UI: a tabbed/stacked right panel with separate party
      ranking and electorate ranking.
- [ ] Update onboarding copy: the AI should know we're working with both
      a party vote and an electorate vote.
- [ ] Update [`AGENTS.md`](../../AGENTS.md) and `docs/SETUP.md` with
      NZ 2026 specifics.

## Test

- [ ] After scraping, `select count(*) from candidacies where
      election_id='nz-2026' and races.kind='electorate'` is in the right
      ballpark (~600+ candidates).
- [ ] Selecting an electorate filters the right panel to that
      electorate's candidates only.
- [ ] Party vote tab shows all parties with manifestos; electorate vote
      tab is independent and re-ranks separately.
- [ ] The matching/explanation flow works for **parties** the same way
      it does for candidates (same prompts, different data).

## Notes

- 2026-06-28: Step 4 is now split into child specs so the work is trackable:
  - [019 — MMP party-vote matching panel](../019-mmp-party-vote-panel/README.md)
    covers party cards / party matching in the right panel.
  - [020 — MMP two-vote conversation and prompt wiring](../020-mmp-two-vote-prompts/README.md)
    covers MMP prompt language and party-vs-electorate question flow.
- `key_positions` JSON probably stays the same shape, just sourced from
  party manifestos instead of candidate statements.
- We may want a "what is this election about?" intro screen for first-time
  users that explains the two-vote system.
- Don't try to support both Auckland 2025 and NZ 2026 simultaneously yet
  — schema (spec 002) makes it possible, but multi-tenant routing isn't a
  priority.

## Dependencies

- **Depends on**: spec 002 (flexible schema) — without it, electorates
  can't be modelled cleanly.
- **Soft-depends on**: spec 001 (chat handler fix) — for end-to-end
  validation.
