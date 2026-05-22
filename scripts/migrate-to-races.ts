// One-shot backfill: read every row in the legacy `candidates` table and
// produce the equivalent rows in the new `elections / races / people /
// candidacies / election_parties` tables (spec 002).
//
// Idempotent: running it twice is safe — it inserts with `onConflictDoNothing`
// on natural-key unique indexes.
//
// Usage: `bun run scripts/migrate-to-races.ts`
import { db } from "../src/lib/server/db";
import {
  candidates,
  elections,
  races,
  people,
  candidacies,
  electionParties,
} from "../src/lib/db/schema";
import { electionConfig, AUCKLAND_2025 } from "../src/lib/config/election";
import { eq, and } from "drizzle-orm";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  // The legacy data is Auckland 2025. Run the script with that config
  // regardless of which election the app is currently configured for.
  const election = AUCKLAND_2025;
  const now = new Date();

  console.log(`Backfilling election=${election.id}…`);

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

  // 2. read all legacy candidate rows
  const legacyRows = await db
    .select()
    .from(candidates)
    .orderBy(candidates.name);
  console.log(`  Found ${legacyRows.length} legacy candidate rows`);

  // 3. distinct wards → races
  const distinctWards = [...new Set(legacyRows.map((r) => r.ward))];
  let raceCount = 0;
  for (const ward of distinctWards) {
    const isMayor = ward === "Mayor";
    const id = `${election.id}-${slug(isMayor ? "mayor" : ward)}`;
    await db
      .insert(races)
      .values({
        id,
        electionId: election.id,
        kind: isMayor ? "mayor" : "ward",
        name: isMayor ? "Mayor of Auckland" : ward,
        district: isMayor ? null : ward,
        createdAt: now,
      })
      .onConflictDoNothing();
    raceCount++;
  }
  console.log(`  Upserted ${raceCount} races`);

  // 4. distinct parties → election_parties
  const distinctParties = [
    ...new Set(legacyRows.map((r) => r.party).filter((p): p is string => !!p)),
  ];
  for (const partyName of distinctParties) {
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
  console.log(`  Upserted ${distinctParties.length} parties`);

  // 5. each candidate → people + candidacies
  let peopleCount = 0;
  let candidacyCount = 0;
  for (const c of legacyRows) {
    const personId = `${election.id}-person-${slug(c.name)}-${c.id}`;
    await db
      .insert(people)
      .values({
        id: personId,
        name: c.name,
        photoUrl: c.photo_url,
        createdAt: now,
      })
      .onConflictDoNothing();
    peopleCount++;

    const isMayor = c.ward === "Mayor";
    const raceId = `${election.id}-${slug(isMayor ? "mayor" : c.ward)}`;
    const partyId = c.party ? `${election.id}-party-${slug(c.party)}` : null;

    await db
      .insert(candidacies)
      .values({
        id: `${election.id}-candidacy-${c.id}`,
        electionId: election.id,
        raceId,
        personId,
        partyId,
        candidateStatement: c.candidate_statement,
        why: c.why,
        keySkills: c.key_skills,
        topIssues: c.top_issues,
        keyPositions: c.key_positions,
        supportingLinks: c.supporting_links,
        legacyCandidateId: c.id,
        createdAt: now,
      })
      .onConflictDoNothing();
    candidacyCount++;
  }
  console.log(
    `  Upserted ${peopleCount} people, ${candidacyCount} candidacies`,
  );

  // 6. sanity check
  const [{ raceTotal }] = await db
    .select({ raceTotal: races.id })
    .from(races)
    .where(eq(races.electionId, election.id))
    .all()
    .then((rows) => [{ raceTotal: rows.length }]);
  const [{ candidacyTotal }] = await db
    .select({ candidacyTotal: candidacies.id })
    .from(candidacies)
    .where(eq(candidacies.electionId, election.id))
    .all()
    .then((rows) => [{ candidacyTotal: rows.length }]);

  console.log(
    `Done. races=${raceTotal}, candidacies=${candidacyTotal}, legacy=${legacyRows.length}`,
  );
  if (candidacyTotal !== legacyRows.length) {
    console.warn(
      `⚠️  candidacy count (${candidacyTotal}) doesn't match legacy candidates (${legacyRows.length})`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exitCode = 1;
});
