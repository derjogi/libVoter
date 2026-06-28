// Smoke tests against the live SQLite DBs. Verifies the spec-002 backfill
// produced the expected number of rows in the Auckland election DB and that the
// active NZ DB still drives the generic candidate-loading actions.

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
import { db, getDbClient, getReferenceDbClient } from "@/lib/server/db";

const AUCKLAND = "auckland-2025";
const aucklandDb = getDbClient({ electionId: AUCKLAND });
const referenceDb = getReferenceDbClient();

describe("Spec 002 schema & backfill", () => {
  it("elections row exists for auckland-2025", async () => {
    const rows = await aucklandDb
      .select()
      .from(elections)
      .where(eq(elections.id, AUCKLAND))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].votingSystem).toBe("stv");
  });

  it("race count matches distinct legacy wards (incl. Mayor)", async () => {
    const allLegacy = await aucklandDb
      .select({ ward: legacyCandidates.ward })
      .from(legacyCandidates)
      .all();
    const distinct = new Set(allLegacy.map((r) => r.ward));

    const raceRows = await aucklandDb
      .select({ id: races.id })
      .from(races)
      .where(eq(races.electionId, AUCKLAND))
      .all();
    expect(raceRows.length).toBe(distinct.size);
  });

  it("candidacy count matches legacy candidate count", async () => {
    const legacyCount = (
      await aucklandDb
        .select({ id: legacyCandidates.id })
        .from(legacyCandidates)
        .all()
    ).length;
    const candidacyCount = (
      await aucklandDb
        .select({ id: candidacies.id })
        .from(candidacies)
        .where(eq(candidacies.electionId, AUCKLAND))
        .all()
    ).length;
    expect(candidacyCount).toBe(legacyCount);
  });

  it("legacy Auckland candidates match the Auckland candidacy join for an arbitrary ward", async () => {
    // Pick the first non-mayor ward.
    const firstRace = await aucklandDb
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
      await aucklandDb
        .select({ name: legacyCandidates.name })
        .from(legacyCandidates)
        .where(eq(legacyCandidates.ward, ward))
        .all()
    )
      .map((r) => r.name)
      .sort();

    // Names via candidacies → people.
    const newNames = (
      await aucklandDb
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
  it("reference SQLite database has the utterance and mention tables", async () => {
    await expect(
      referenceDb.select().from(hansardUtterances).limit(1).all(),
    ).resolves.toEqual(expect.any(Array));
    await expect(
      referenceDb.select().from(hansardMentions).limit(1).all(),
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

  it("getCandidatesForSeat returns active-election candidacies and not Auckland mayors", async () => {
    const { getCandidatesForSeat } = await import("@/lib/actions/database");

    const seatRows = await db
      .select({ name: races.name, district: races.district })
      .from(races)
      .where(and(eq(races.electionId, "nz-2026"), eq(races.kind, "electorate")))
      .limit(1)
      .all();
    expect(seatRows).toHaveLength(1);

    const seat = seatRows[0].district ?? seatRows[0].name;
    const expectedNames = (
      await db
        .select({ name: people.name })
        .from(candidacies)
        .innerJoin(people, eq(people.id, candidacies.personId))
        .innerJoin(races, eq(races.id, candidacies.raceId))
        .where(
          and(
            eq(candidacies.electionId, "nz-2026"),
            eq(races.kind, "electorate"),
            eq(races.district, seat),
          ),
        )
        .all()
    )
      .map((row) => row.name)
      .sort();
    expect(expectedNames.length).toBeGreaterThan(0);

    const result = await getCandidatesForSeat(seat);

    expect(result.success).toBe(true);
    const names = (result.data ?? []).map((candidate) => candidate.name).sort();
    expect(names).toEqual(expectedNames);
    expect(names).not.toContain("Wayne Brown");
  });

  it('getUniqueWards excludes "Mayor"', async () => {
    const { getUniqueWards } = await import("@/lib/actions/database");
    const result = await getUniqueWards();
    expect(result.success).toBe(true);
    expect(result.data).not.toContain("Mayor");
  });
});
