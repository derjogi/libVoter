// Smoke tests against the live SQLite DB. Verifies the spec-002 backfill
// produced the expected number of rows and that the legacy `getCandidatesByWard`
// API still returns matching candidate names compared to the new
// candidacies-via-races path.

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  candidacies,
  elections,
  hansardMentions,
  hansardUtterances,
  candidates as legacyCandidates,
  people,
  races,
} from "@/lib/db/schema";
import { db } from "@/lib/server/db";

const AUCKLAND = "auckland-2025";

describe("Spec 002 schema & backfill", () => {
  it("elections row exists for auckland-2025", async () => {
    const rows = await db
      .select()
      .from(elections)
      .where(eq(elections.id, AUCKLAND))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].votingSystem).toBe("stv");
  });

  it("race count matches distinct legacy wards (incl. Mayor)", async () => {
    const allLegacy = await db
      .select({ ward: legacyCandidates.ward })
      .from(legacyCandidates)
      .all();
    const distinct = new Set(allLegacy.map((r) => r.ward));

    const raceRows = await db
      .select({ id: races.id })
      .from(races)
      .where(eq(races.electionId, AUCKLAND))
      .all();
    expect(raceRows.length).toBe(distinct.size);
  });

  it("candidacy count matches legacy candidate count", async () => {
    const legacyCount = (
      await db.select({ id: legacyCandidates.id }).from(legacyCandidates).all()
    ).length;
    const candidacyCount = (
      await db
        .select({ id: candidacies.id })
        .from(candidacies)
        .where(eq(candidacies.electionId, AUCKLAND))
        .all()
    ).length;
    expect(candidacyCount).toBe(legacyCount);
  });

  it("legacy getCandidatesByWard returns same names as candidacy join for an arbitrary ward", async () => {
    // Pick the first non-mayor ward.
    const firstRace = await db
      .select()
      .from(races)
      .where(and(eq(races.electionId, AUCKLAND), eq(races.kind, "ward")))
      .limit(1)
      .all();
    expect(firstRace.length).toBe(1);
    const ward = firstRace[0].district ?? "";
    if (!ward) {
      throw new Error("Expected race district to be defined");
    }

    // Names via the legacy table.
    const legacyNames = (
      await db
        .select({ name: legacyCandidates.name })
        .from(legacyCandidates)
        .where(eq(legacyCandidates.ward, ward))
        .all()
    )
      .map((r) => r.name)
      .sort();

    // Names via candidacies → people.
    const newNames = (
      await db
        .select({ name: people.name })
        .from(candidacies)
        .innerJoin(people, eq(people.id, candidacies.personId))
        .where(
          and(
            eq(candidacies.electionId, AUCKLAND),
            eq(candidacies.raceId, firstRace[0].id),
          ),
        )
        .all()
    )
      .map((r) => r.name)
      .sort();

    expect(newNames).toEqual(legacyNames);
  });
});

describe("Spec 015 Hansard segmentation schema", () => {
  it("committed SQLite database has the utterance and mention tables", async () => {
    await expect(
      db.select().from(hansardUtterances).limit(1).all(),
    ).resolves.toEqual(expect.any(Array));
    await expect(
      db.select().from(hansardMentions).limit(1).all(),
    ).resolves.toEqual(expect.any(Array));
  });
});

describe("database actions", () => {
  it("getSeatsForCurrentElection returns a non-empty list", async () => {
    const { getSeatsForCurrentElection } = await import(
      "@/lib/actions/database"
    );
    const result = await getSeatsForCurrentElection();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as string[]).length).toBeGreaterThan(0);
  });

  it('getUniqueWards excludes "Mayor"', async () => {
    const { getUniqueWards } = await import("@/lib/actions/database");
    const result = await getUniqueWards();
    expect(result.success).toBe(true);
    expect(result.data).not.toContain("Mayor");
  });
});
