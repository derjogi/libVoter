'use server';

import { db } from '@/lib/server/db';
import {
  candidates,
  parties,
  appSettings,
  races,
  candidacies,
} from '@/lib/db/schema';
import { eq, like, or, ne, inArray, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { electionConfig } from '@/lib/config/election';

// Load all candidates
export async function loadCandidates() {
  try {
    const data = await db.select().from(candidates).orderBy(candidates.name);
    return { success: true, data };
  } catch (error) {
    console.error('Error loading candidates:', error);
    return { success: false, error: 'Failed to load candidates' };
  }
}

// Load parties
export async function loadParties() {
  try {
    const data = await db.select().from(parties).orderBy(parties.name);
    return { success: true, data };
  } catch (error) {
    console.error('Error loading parties:', error);
    return { success: false, error: 'Failed to load parties' };
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

    revalidatePath('/'); // Revalidate to update cached data
    return { success: true };
  } catch (error) {
    console.error('Error updating app setting:', error);
    return { success: false, error: 'Failed to update setting' };
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
      return { success: false, error: 'Setting not found' };
    }

    return { success: true, data: JSON.parse(result[0].value as string || 'null') };
  } catch (error) {
    console.error('Error getting app setting:', error);
    return { success: false, error: 'Failed to get setting' };
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
      .where(ne(candidates.ward, 'Mayor'))
      .orderBy(candidates.ward);

    const wards = data.map(row => row.ward);
    return { success: true, data: wards };
  } catch (error) {
    console.error('Error loading wards:', error);
    return { success: false, error: 'Failed to load wards' };
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
      (k) => k !== 'mayor' && k !== 'list'
    );

    if (userFacingKinds.length > 0) {
      const rows = await db
        .selectDistinct({ name: races.name, district: races.district })
        .from(races)
        .where(
          and(
            eq(races.electionId, electionId),
            inArray(races.kind, userFacingKinds)
          )
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
    console.error('Error loading seats:', error);
    return getUniqueWards();
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
          like(candidates.party, `%${query}%`)
        )
      )
      .orderBy(candidates.name)
      .limit(20);

    return { success: true, data };
  } catch (error) {
    console.error('Error searching candidates:', error);
    return { success: false, error: 'Failed to search candidates' };
  }
}

// Get candidates by ward
export async function getCandidatesByWard(ward: string) {
  try {
    const data = await db
      .select()
      .from(candidates)
      .where(eq(candidates.ward, ward))
      .orderBy(candidates.name);

    return { success: true, data };
  } catch (error) {
    console.error('Error loading candidates by ward:', error);
    return { success: false, error: 'Failed to load candidates by ward' };
  }
}

// Get mayor candidates
export async function getMayorCandidates() {
  try {
    const data = await db
      .select()
      .from(candidates)
      .where(eq(candidates.ward, 'Mayor'))
      .orderBy(candidates.name);

    return { success: true, data };
  } catch (error) {
    console.error('Error loading mayor candidates:', error);
    return { success: false, error: 'Failed to load mayor candidates' };
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
      .where(inArray(candidates.id, ids.map(id => parseInt(id))))
      .orderBy(candidates.name);

    return { success: true, data };
  } catch (error) {
    console.error('Error loading candidates by IDs:', error);
    return { success: false, error: 'Failed to load candidates by IDs' };
  }
}