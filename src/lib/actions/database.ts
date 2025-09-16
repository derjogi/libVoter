'use server';

import { db } from '@/lib/server/db';
import { candidates, parties, appSettings } from '@/lib/db/schema';
import { eq, like, or, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { Candidate, CandidateMatch } from '@/types';

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