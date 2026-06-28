import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  candidacies,
  candidates,
  elections,
  evidenceSources,
  races,
} from "@/lib/db/schema";
import {
  getDbClient,
  getReferenceDbClient,
  resolveDatabaseUrl,
  resolveElectionDbPath,
  resolveReferenceDbPath,
} from "@/lib/server/db";
import { collectionNameForElection } from "@/lib/server/rag/vector-store";

describe("per-election storage resolution", () => {
  it("defaults election databases to data/elections/<election>.db", () => {
    expect(resolveElectionDbPath("nz-2026")).toBe(
      "file:./data/elections/nz-2026.db",
    );
    expect(resolveDatabaseUrl("auckland-2025", {})).toBe(
      "file:./data/elections/auckland-2025.db",
    );
  });

  it("keeps parliament-scoped reference data in reference.db", () => {
    expect(resolveReferenceDbPath()).toBe("file:./data/reference.db");
  });

  it("names Chroma collections per election", () => {
    expect(collectionNameForElection("nz-2026")).toBe("evidence-nz-2026");
    expect(collectionNameForElection("auckland-2025")).toBe(
      "evidence-auckland-2025",
    );
  });
});

describe("split election databases", () => {
  it("active NZ database contains NZ election rows and no Auckland legacy rows", async () => {
    const nzDb = getDbClient({ electionId: "nz-2026" });

    await expect(
      nzDb.select().from(elections).where(eq(elections.id, "nz-2026")).all(),
    ).resolves.toHaveLength(1);
    await expect(nzDb.select().from(candidates).all()).resolves.toHaveLength(0);

    const raceRows = await nzDb.select().from(races).all();
    expect(raceRows.length).toBeGreaterThan(0);
    expect(new Set(raceRows.map((row) => row.electionId))).toEqual(
      new Set(["nz-2026"]),
    );
  });

  it("Auckland database contains Auckland rows and no NZ candidacies", async () => {
    const aucklandDb = getDbClient({ electionId: "auckland-2025" });

    await expect(
      aucklandDb
        .select()
        .from(elections)
        .where(eq(elections.id, "auckland-2025"))
        .all(),
    ).resolves.toHaveLength(1);
    await expect(
      aucklandDb
        .select()
        .from(candidacies)
        .where(eq(candidacies.electionId, "nz-2026"))
        .all(),
    ).resolves.toHaveLength(0);
  });

  it("reference database contains Hansard but election database does not", async () => {
    const nzDb = getDbClient({ electionId: "nz-2026" });
    const referenceDb = getReferenceDbClient();

    await expect(
      nzDb
        .select()
        .from(evidenceSources)
        .where(eq(evidenceSources.sourceType, "hansard"))
        .all(),
    ).resolves.toHaveLength(0);

    const hansardRows = await referenceDb
      .select()
      .from(evidenceSources)
      .where(eq(evidenceSources.sourceType, "hansard"))
      .limit(1)
      .all();
    expect(hansardRows).toHaveLength(1);
  });
});
