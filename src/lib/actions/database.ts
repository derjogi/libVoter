"use server";

import { and, eq, inArray, like, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { electionConfig } from "@/lib/config/election";
import {
  appSettings,
  type Candidate,
  candidacies,
  candidates,
  electionParties,
  parties,
  people,
  races,
} from "@/lib/db/schema";
import { newTraceId, serializeError } from "@/lib/debug/logging";
import { db } from "@/lib/server/db";
import type { PartySummary } from "@/types";

// Load all candidates
export async function loadCandidates() {
  try {
    const data = await db.select().from(candidates).orderBy(candidates.name);
    return { success: true, data };
  } catch (error) {
    console.error("Error loading candidates:", error);
    return { success: false, error: "Failed to load candidates" };
  }
}

// Load parties
export async function loadParties() {
  try {
    const data = await db.select().from(parties).orderBy(parties.name);
    return { success: true, data };
  } catch (error) {
    console.error("Error loading parties:", error);
    return { success: false, error: "Failed to load parties" };
  }
}

// Update app settings
export async function updateAppSetting(key: string, value: any) {
  try {
    await db
      .insert(appSettings)
      .values({
        id: crypto.randomUUID(),
        key,
        value: JSON.stringify(value),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: JSON.stringify(value),
          updated_at: new Date(),
        },
      });

    revalidatePath("/"); // Revalidate to update cached data
    return { success: true };
  } catch (error) {
    console.error("Error updating app setting:", error);
    return { success: false, error: "Failed to update setting" };
  }
}

// Get app setting
export async function getAppSetting(key: string) {
  try {
    const result = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    if (result.length === 0) {
      return { success: false, error: "Setting not found" };
    }

    return {
      success: true,
      data: JSON.parse((result[0].value as string) || "null"),
    };
  } catch (error) {
    console.error("Error getting app setting:", error);
    return { success: false, error: "Failed to get setting" };
  }
}

// Get unique wards from candidates table, excluding "Mayor"
//
// Kept for backward compatibility. Prefer `getSeatsForCurrentElection()` which
// uses the new `races` table and works for any election.
export async function getUniqueWards() {
  try {
    const data = await db
      .selectDistinct({ ward: candidates.ward })
      .from(candidates)
      .where(ne(candidates.ward, "Mayor"))
      .orderBy(candidates.ward);

    const wards = data.map((row) => row.ward);
    return { success: true, data: wards };
  } catch (error) {
    console.error("Error loading wards:", error);
    return { success: false, error: "Failed to load wards" };
  }
}

/**
 * Generic version of `getUniqueWards()`: returns the list of seats (wards or
 * electorates) the user can pick from for the currently configured election.
 *
 * Prefers the new `races` table (filled by spec-002 migration). Falls back to
 * the legacy `candidates.ward` column if races haven't been backfilled yet,
 * so the running app keeps working.
 */
export async function getSeatsForCurrentElection() {
  try {
    const electionId = electionConfig.id;

    // Try the new schema first.
    const userFacingKinds = electionConfig.seatTypes.filter(
      (k) => k !== "mayor" && k !== "list",
    );

    if (userFacingKinds.length > 0) {
      const rows = await db
        .selectDistinct({ name: races.name, district: races.district })
        .from(races)
        .where(
          and(
            eq(races.electionId, electionId),
            inArray(races.kind, userFacingKinds),
          ),
        )
        .orderBy(races.name);

      if (rows.length > 0) {
        return {
          success: true,
          data: rows.map((r) => r.district ?? r.name),
        };
      }
    }

    // Fallback: legacy candidates.ward.
    return getUniqueWards();
  } catch (error) {
    console.error("Error loading seats:", error);
    return getUniqueWards();
  }
}

/**
 * Spec 019: list the parties contesting the currently configured election for
 * the MMP party-vote lane. Reads the generic `election_parties` table (spec
 * 002), scoped to the active election. Returns a lightweight, serializable
 * shape suitable for crossing the Server Action boundary to the client panel.
 */
export async function getPartiesForCurrentElection(): Promise<{
  success: boolean;
  data?: PartySummary[];
  error?: string;
}> {
  const traceId = newTraceId("action:getPartiesForCurrentElection");
  const start = Date.now();
  console.log(`[${traceId}] start`, { electionId: electionConfig.id });
  try {
    const rows = await db
      .select({
        id: electionParties.id,
        name: electionParties.name,
        leader: electionParties.leader,
      })
      .from(electionParties)
      .where(eq(electionParties.electionId, electionConfig.id))
      .orderBy(electionParties.name);

    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      count: rows.length,
    });
    return { success: true, data: rows };
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return { success: false, error: "Failed to load parties for election" };
  }
}

// Search candidates by name or party
export async function searchCandidates(query: string) {
  try {
    const data = await db
      .select()
      .from(candidates)
      .where(
        or(
          like(candidates.name, `%${query}%`),
          like(candidates.party, `%${query}%`),
        ),
      )
      .orderBy(candidates.name)
      .limit(20);

    return { success: true, data };
  } catch (error) {
    console.error("Error searching candidates:", error);
    return { success: false, error: "Failed to search candidates" };
  }
}

// Get candidates by ward
export async function getCandidatesByWard(ward: string) {
  const traceId = newTraceId("action:getCandidatesByWard");
  const start = Date.now();
  console.log(`[${traceId}] start`, { ward });
  try {
    const data = await db
      .select()
      .from(candidates)
      .where(eq(candidates.ward, ward))
      .orderBy(candidates.name);

    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      count: data.length,
    });
    return { success: true, data };
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return { success: false, error: "Failed to load candidates by ward" };
  }
}

function stableNumericId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

/**
 * Generic active-election candidate lookup for a user-facing seat.
 *
 * Reads `races -> candidacies -> people/election_parties` instead of the
 * legacy Auckland-only `candidates.ward` table, so NZ electorates cannot leak
 * Auckland mayoral candidates into the selected race.
 */
export async function getCandidatesForSeat(seat: string) {
  const traceId = newTraceId("action:getCandidatesForSeat");
  const start = Date.now();
  console.log(`[${traceId}] start`, { seat, electionId: electionConfig.id });

  try {
    const userFacingKinds = electionConfig.seatTypes.filter(
      (k) => k !== "mayor" && k !== "list",
    );

    if (userFacingKinds.length > 0) {
      const rows = await db
        .select({
          candidacyId: candidacies.id,
          legacyCandidateId: candidacies.legacyCandidateId,
          name: people.name,
          party: electionParties.name,
          seatName: races.name,
          district: races.district,
          candidateStatement: candidacies.candidateStatement,
          keyPositions: candidacies.keyPositions,
          why: candidacies.why,
          keySkills: candidacies.keySkills,
          topIssues: candidacies.topIssues,
          supportingLinks: candidacies.supportingLinks,
          photoUrl: people.photoUrl,
          createdAt: candidacies.createdAt,
        })
        .from(candidacies)
        .innerJoin(races, eq(races.id, candidacies.raceId))
        .innerJoin(people, eq(people.id, candidacies.personId))
        .leftJoin(electionParties, eq(electionParties.id, candidacies.partyId))
        .where(
          and(
            eq(candidacies.electionId, electionConfig.id),
            inArray(races.kind, userFacingKinds),
            or(eq(races.district, seat), eq(races.name, seat)),
          ),
        )
        .orderBy(people.name);

      if (rows.length > 0) {
        const data: Candidate[] = rows.map((row) => ({
          id: row.legacyCandidateId ?? stableNumericId(row.candidacyId),
          name: row.name,
          party: row.party,
          ward: row.district ?? row.seatName,
          candidate_statement: row.candidateStatement,
          key_positions: row.keyPositions,
          why: row.why,
          key_skills: row.keySkills,
          top_issues: row.topIssues,
          supporting_links: row.supportingLinks,
          photo_url: row.photoUrl,
          created_at: row.createdAt,
        }));

        console.log(`[${traceId}] done`, {
          elapsedMs: Date.now() - start,
          count: data.length,
        });
        return { success: true, data };
      }
    }

    // Fallback for a DB that has not been backfilled yet. Still intentionally
    // excludes the old Auckland mayor path.
    return getCandidatesByWard(seat);
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return { success: false, error: "Failed to load candidates for seat" };
  }
}

// Get mayor candidates
export async function getMayorCandidates() {
  const traceId = newTraceId("action:getMayorCandidates");
  const start = Date.now();
  console.log(`[${traceId}] start`);
  try {
    const data = await db
      .select()
      .from(candidates)
      .where(eq(candidates.ward, "Mayor"))
      .orderBy(candidates.name);

    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      count: data.length,
    });
    return { success: true, data };
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return { success: false, error: "Failed to load mayor candidates" };
  }
}

// Get candidates by IDs
export async function getCandidatesByIds(ids: string[]) {
  try {
    if (ids.length === 0) {
      return { success: true, data: [] };
    }

    const data = await db
      .select()
      .from(candidates)
      .where(
        inArray(
          candidates.id,
          ids.map((id) => parseInt(id, 10)),
        ),
      )
      .orderBy(candidates.name);

    return { success: true, data };
  } catch (error) {
    console.error("Error loading candidates by IDs:", error);
    return { success: false, error: "Failed to load candidates by IDs" };
  }
}
