/**
 * Coverage report: shows which candidates have evidence and which don't.
 * Run: DATABASE_URL="file:./data/elections/nz-2026.db" bun run scripts/coverage-report.ts
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  candidacies,
  electionParties,
  evidenceSources,
  people,
  races,
} from "../src/lib/db/schema";

const url = process.env.DATABASE_URL ?? "file:./data/elections/nz-2026.db";
const client = createClient({ url });
const db = drizzle(client);

const allRaces = await db.select().from(races);
const allCandidacies = await db.select().from(candidacies);
const allPeople = await db.select().from(people);
const allEvidence = await db.select().from(evidenceSources);
const allParties = await db.select().from(electionParties);

console.log("=== NZ 2026 Database Coverage Report ===\n");
console.log(`Races: ${allRaces.length}`);
console.log(`Candidacies: ${allCandidacies.length}`);
console.log(`People: ${allPeople.length}`);
console.log(`Election parties: ${allParties.length}`);
console.log(`Evidence sources: ${allEvidence.length}`);

// Evidence by source type
const byType: Record<string, number> = {};
const byAdapter: Record<string, number> = {};
for (const s of allEvidence) {
  byType[s.sourceType] = (byType[s.sourceType] || 0) + 1;
  byType[s.sourceAdapter] = (byType[s.sourceAdapter] || 0) + 1;
}
console.log("\nEvidence by source type:", byType);
console.log("Evidence by adapter:", byAdapter);

// Candidates with personal evidence
const candidatesWithEvidence = new Set(
  allEvidence.filter((s) => s.candidateId).map((s) => s.candidateId as string),
);
console.log(
  `\nCandidates with personal evidence: ${candidatesWithEvidence.size} / ${allPeople.length}`,
);

// Per-race coverage
const raceCoverage = new Map<string, { total: number; withEvidence: number }>();
for (const c of allCandidacies) {
  const race = allRaces.find((r) => r.id === c.raceId);
  const raceName = race?.name ?? "unknown";
  const entry = raceCoverage.get(raceName) ?? { total: 0, withEvidence: 0 };
  entry.total++;
  if (c.personId && candidatesWithEvidence.has(c.personId)) {
    entry.withEvidence++;
  }
  raceCoverage.set(raceName, entry);
}

const sortedRaces = [...raceCoverage.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
);
console.log(`\n=== Per-electorate coverage (${sortedRaces.length} races) ===`);
for (const [name, cov] of sortedRaces) {
  const pct =
    cov.total > 0 ? Math.round((cov.withEvidence / cov.total) * 100) : 0;
  const bar =
    "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
  console.log(
    `  ${name.padEnd(35)} ${cov.withEvidence}/${cov.total} [${bar}] ${pct}%`,
  );
}

// Candidates with Wikipedia URLs
const withWiki = allCandidacies.filter(
  (c) =>
    c.supportingLinks &&
    Array.isArray(c.supportingLinks) &&
    c.supportingLinks.length > 0,
);
console.log(
  `\nCandidacies with Wikipedia article URLs: ${withWiki.length} / ${allCandidacies.length}`,
);

// Candidates with Wikipedia URLs but no evidence
const noEvidenceWithWiki = withWiki.filter(
  (c) => !c.personId || !candidatesWithEvidence.has(c.personId),
);
console.log(
  `Candidates with Wikipedia URL but NO evidence: ${noEvidenceWithWiki.length}`,
);

console.log("\nSample 30 candidates with Wikipedia URL but no evidence:");
for (const c of noEvidenceWithWiki.slice(0, 30)) {
  const person = allPeople.find((p) => p.id === c.personId);
  const race = allRaces.find((r) => r.id === c.raceId);
  const party = allParties.find((p) => p.id === c.partyId);
  const wikiUrl = Array.isArray(c.supportingLinks) ? c.supportingLinks[0] : "";
  console.log(
    `  ${person?.name ?? "unknown"} (${race?.name ?? "?"}, ${party?.name ?? "Independent"})`,
  );
  console.log(`    → ${wikiUrl}`);
}

// Incumbents (people who have Hansard evidence)
const hansardEvidence = allEvidence.filter(
  (s) => s.sourceAdapter === "nz-hansard",
);
console.log(`\nHansard evidence sources: ${hansardEvidence.length}`);

process.exit(0);
