"use server";

import { eq, inArray, like, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { electionConfig } from "@/lib/config/election";
import { appSettings, candidates, parties } from "@/lib/db/schema";
import { newTraceId, serializeError } from "@/lib/debug/logging";
import { db } from "@/lib/server/db";
import { electionDataRepository } from "@/lib/server/election-data";
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
    return { success: true, data: await electionDataRepository.listSeats() };
  } catch (error) {
    console.error("Error loading seats:", error);
    return { success: false, error: "Failed to load seats" };
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
    const rows = await electionDataRepository.listParties();

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
    const data = await electionDataRepository.getCandidatesForSeat(seat);
    return { success: true, data };
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return { success: false, error: "Failed to load candidates for seat" };
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
