// Build the IdentityIndex from the database (spec 010).
//
// Candidate identity spans two models during the spec-002 migration:
//   - Auckland 2025 lives in the legacy `candidates` table (integer id → string,
//     district = ward).
//   - Generic elections (e.g. nz-2026) live in `candidacies` → `people` (person
//     id, district = race.district).
// Parties always come from `electionParties` scoped to the election.

import { eq } from "drizzle-orm";
import {
  candidacies,
  electionParties,
  candidates as legacyCandidates,
  people,
  races,
} from "../../db/schema";
import { db as defaultDb } from "../db";
import type { IdentityIndex } from "./identity";

export async function buildIdentityIndex(
  electionId: string,
  db: typeof defaultDb = defaultDb,
): Promise<IdentityIndex> {
  const index: IdentityIndex = { candidates: [], parties: [] };

  if (electionId === "auckland-2025") {
    const rows = await db
      .select({
        id: legacyCandidates.id,
        name: legacyCandidates.name,
        ward: legacyCandidates.ward,
      })
      .from(legacyCandidates)
      .all();
    for (const r of rows) {
      index.candidates.push({
        id: String(r.id),
        name: r.name,
        district: r.ward,
      });
    }
  } else {
    const rows = await db
      .select({
        id: people.id,
        name: people.name,
        district: races.district,
      })
      .from(candidacies)
      .innerJoin(people, eq(people.id, candidacies.personId))
      .innerJoin(races, eq(races.id, candidacies.raceId))
      .where(eq(candidacies.electionId, electionId))
      .all();
    for (const r of rows) {
      index.candidates.push({
        id: r.id,
        name: r.name,
        district: r.district ?? undefined,
      });
    }
  }

  const partyRows = await db
    .select({ id: electionParties.id, name: electionParties.name })
    .from(electionParties)
    .where(eq(electionParties.electionId, electionId))
    .all();
  for (const p of partyRows) {
    index.parties.push({ id: p.id, name: p.name });
  }

  return index;
}
