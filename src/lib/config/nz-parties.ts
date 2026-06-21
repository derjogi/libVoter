// Canonical list of registered parties contesting the NZ 2026 general
// election. Single source of truth shared by:
//   - scripts/scrape-nz-2026.ts  → seeds `election_parties` rows
//   - WikipediaPartyAdapter      → ingests each party's platform as evidence
//
// `name` MUST match what is stored in election_parties.name (identity
// resolution links evidence → party by normalized name). The first six keep
// their existing short seed names so their party ids stay stable; `wikiTitle`
// is the English Wikipedia article used as the evidence source.
//
// Source list: 2026 New Zealand general election, "Parties and candidates"
// (https://en.wikipedia.org/wiki/2026_New_Zealand_general_election).

export interface NzParty {
  /** Display name; matches election_parties.name for nz-2026. */
  name: string;
  /** English Wikipedia article title used as the evidence source. */
  wikiTitle: string;
}

export const NZ_2026_PARTIES: NzParty[] = [
  { name: "National", wikiTitle: "New Zealand National Party" },
  { name: "Labour", wikiTitle: "New Zealand Labour Party" },
  { name: "Green", wikiTitle: "Green Party of Aotearoa New Zealand" },
  { name: "ACT", wikiTitle: "ACT New Zealand" },
  { name: "NZ First", wikiTitle: "New Zealand First" },
  { name: "Te Pāti Māori", wikiTitle: "Te Pāti Māori" },
  { name: "The Opportunity Party", wikiTitle: "The Opportunity Party" },
  {
    name: "Aotearoa Legalise Cannabis Party",
    wikiTitle: "Aotearoa Legalise Cannabis Party",
  },
  {
    name: "NZ Outdoors & Freedom Party",
    wikiTitle: "NZ Outdoors & Freedom Party",
  },
  { name: "Vision NZ", wikiTitle: "Vision NZ" },
  {
    name: "Animal Justice Party",
    wikiTitle: "Animal Justice Party Aotearoa New Zealand",
  },
  { name: "Conservative Party NZ", wikiTitle: "Conservative Party NZ" },
  { name: "Women's Rights Party", wikiTitle: "Women's Rights Party" },
];
