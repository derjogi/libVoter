"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { electionConfig } from "@/lib/config/election";
import { appSettings } from "@/lib/db/schema";
import { newTraceId, serializeError } from "@/lib/debug/logging";
import { db } from "@/lib/server/db";
import { electionDataRepository } from "@/lib/server/election-data";
import type { PartySummary } from "@/types";

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

/** List the user-selectable seats for the configured election. */
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

/**
 * Generic active-election candidate lookup for a user-facing seat.
 * Storage-specific fields are translated by the election data repository.
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
