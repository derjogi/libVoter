// Scraper scaffold for the NZ 2026 General Election (spec 003).
//
// Currently a stub: it registers an `elections` row for nz-2026 so the rest
// of the app (and the new schema) is wired up, but does NOT yet pull real
// candidate data from elections.nz. Fill in `scrapeElectorates()` and
// `scrapeParties()` when the official lists are published.
//
// Usage:
//   bun run scripts/scrape-nz-2026.ts        # populate election + sample data
//   bun run scripts/scrape-nz-2026.ts --real # (future) actually scrape elections.nz
//
// Why a stub? The 2026 candidate lists aren't published yet, but having the
// election row + schema + electorate races in place lets us:
//   - flip electionConfig to NZ_2026 and exercise the UI/AI flow,
//   - test the prompts under MMP language,
//   - keep the seat dropdown working with a small representative sample.
import { db } from "../src/lib/server/db";
import {
  elections,
  races,
  electionParties,
  people,
  candidacies,
} from "../src/lib/db/schema";
import { NZ_2026 } from "../src/lib/config/election";

// A small representative sample so the UI can be exercised end-to-end.
// Replace with real data once elections.nz publishes 2026 candidate lists.
const SAMPLE_ELECTORATES = [
  "Auckland Central",
  "Wellington Central",
  "Christchurch Central",
  "Mt Albert",
  "Epsom",
  "Hamilton East",
  "Dunedin",
  "Tauranga",
];

const SAMPLE_PARTIES = [
  "Labour",
  "National",
  "Green",
  "ACT",
  "Te Pāti Māori",
  "NZ First",
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const election = NZ_2026;
  const now = new Date();

  console.log(`Scaffolding election=${election.id} (sample data only)…`);

  // 1. elections row
  await db
    .insert(elections)
    .values({
      id: election.id,
      name: election.name,
      country: election.country,
      region: election.region,
      year: election.year,
      type: election.type,
      votingSystem: election.votingSystem,
      keyTopics: election.keyTopics,
      description: election.description,
      createdAt: now,
    })
    .onConflictDoNothing();

  // 2. one race per sample electorate, plus a single 'list' race
  for (const electorate of SAMPLE_ELECTORATES) {
    await db
      .insert(races)
      .values({
        id: `${election.id}-electorate-${slug(electorate)}`,
        electionId: election.id,
        kind: "electorate",
        name: electorate,
        district: electorate,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(races)
    .values({
      id: `${election.id}-list`,
      electionId: election.id,
      kind: "list",
      name: "Party List Seats",
      district: null,
      createdAt: now,
    })
    .onConflictDoNothing();

  // 3. parties
  for (const partyName of SAMPLE_PARTIES) {
    await db
      .insert(electionParties)
      .values({
        id: `${election.id}-party-${slug(partyName)}`,
        electionId: election.id,
        name: partyName,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // 4. one placeholder candidate per electorate × party (cartesian product
  //    is too large for sample; just a few demonstrators).
  let count = 0;
  for (const electorate of SAMPLE_ELECTORATES.slice(0, 3)) {
    for (const partyName of SAMPLE_PARTIES.slice(0, 3)) {
      const personName = `Sample ${partyName} Candidate (${electorate})`;
      const personId = `${election.id}-person-${slug(personName)}`;
      await db
        .insert(people)
        .values({ id: personId, name: personName, createdAt: now })
        .onConflictDoNothing();

      await db
        .insert(candidacies)
        .values({
          id: `${election.id}-candidacy-${slug(personName)}`,
          electionId: election.id,
          raceId: `${election.id}-electorate-${slug(electorate)}`,
          personId,
          partyId: `${election.id}-party-${slug(partyName)}`,
          candidateStatement: `Placeholder candidate statement for ${personName}.`,
          createdAt: now,
        })
        .onConflictDoNothing();
      count++;
    }
  }

  console.log(
    `Seeded ${SAMPLE_ELECTORATES.length} electorates, ${SAMPLE_PARTIES.length} parties, ${count} candidacies (sample).`,
  );
  console.log("To switch the running app to NZ 2026:");
  console.log(
    "  1. Edit src/lib/config/election.ts: `export const electionConfig = NZ_2026;`",
  );
  console.log("  2. Restart dev server.");
}

main().catch((err) => {
  console.error("Scaffold failed:", err);
  process.exitCode = 1;
});
