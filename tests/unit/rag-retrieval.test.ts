// Unit tests for spec 009 Phase 4 evidence retrieval: the distance→similarity
// fix, the electorate-scoping Chroma filter builder, and mock-mode retrieval.

import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

describe("distanceToSimilarity (inversion-bug regression)", () => {
  it("maps lower distance → higher similarity, monotonically", async () => {
    const { distanceToSimilarity } = await import(
      "@/lib/server/rag/vector-store"
    );
    const near = distanceToSimilarity(0.1);
    const far = distanceToSimilarity(2.0);
    expect(near).toBeGreaterThan(far);
    expect(distanceToSimilarity(0)).toBe(1);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(1);
  });
});

describe("buildWhereFilter (electorate scoping)", () => {
  it("returns undefined when nothing to filter", async () => {
    const { buildWhereFilter } = await import("@/lib/server/rag/vector-store");
    expect(buildWhereFilter()).toBeUndefined();
    expect(buildWhereFilter({})).toBeUndefined();
  });

  it("ORs candidate and party id membership and ANDs the election scope", async () => {
    const { buildWhereFilter } = await import("@/lib/server/rag/vector-store");
    const where = buildWhereFilter({
      electionId: "nz-2026",
      candidateIds: ["c1"],
      partyIds: ["p1", "p2"],
    });
    expect(where).toEqual({
      $and: [
        { election_id: "nz-2026" },
        {
          $or: [
            { candidate_id: { $in: ["c1"] } },
            { party_id: { $in: ["p1", "p2"] } },
          ],
        },
      ],
    });
  });

  it("uses a bare clause when only one id list is present", async () => {
    const { buildWhereFilter } = await import("@/lib/server/rag/vector-store");
    expect(buildWhereFilter({ partyIds: ["p1"] })).toEqual({
      party_id: { $in: ["p1"] },
    });
  });
});

describe("VectorStoreManager collection reset", () => {
  it("deletes only the evidence collection and discards the cached handle", async () => {
    const { VectorStoreManager } = await import(
      "@/lib/server/rag/vector-store"
    );
    const deleted: string[] = [];
    const stores = [
      {
        index: {
          deleteCollection: async ({ name }: { name: string }) => {
            deleted.push(name);
          },
        },
        ensureCollection: async () => undefined,
      },
      {},
    ];
    let created = 0;
    const manager = new VectorStoreManager(
      {} as never,
      () => stores[created++] as never,
    );

    await manager.reset();

    expect(deleted).toEqual(["evidence"]);
    expect(created).toBe(2);
  });
});

describe("evidence retrieval (mock mode)", () => {
  it("restricts results to the requested party scope and is similarity-sorted", async () => {
    const { RAGQueryEngine } = await import("@/lib/server/rag/query-engine");
    const engine = new RAGQueryEngine();

    const chunks = await engine.retrieveEvidence("climate and housing", {
      electionId: "nz-2026",
      partyIds: ["nz-2026-party-green"],
    });

    expect(chunks.length).toBeGreaterThan(0);
    // Only the in-scope party's chunks come back.
    expect(chunks.every((c) => c.partyId === "nz-2026-party-green")).toBe(true);
    // Each chunk round-trips its citation.
    expect(chunks[0].sourceUrl).toContain("wikipedia.org");
    expect(chunks[0].sourceType).toBe("party_policy");
    // Sorted by similarity, descending.
    const scores = chunks.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("never returns out-of-election chunks", async () => {
    const { RAGQueryEngine } = await import("@/lib/server/rag/query-engine");
    const engine = new RAGQueryEngine();
    const chunks = await engine.retrieveEvidence("anything", {
      electionId: "some-other-election",
      partyIds: ["nz-2026-party-green"],
    });
    expect(chunks).toHaveLength(0);
  });

  it("splits a candidate's individual track record from their party line", async () => {
    const { RAGQueryEngine } = await import("@/lib/server/rag/query-engine");
    const engine = new RAGQueryEngine();
    const { individual, party } = await engine.retrieveForCandidate(
      "housing",
      "nonexistent-candidate",
      "nz-2026-party-labour",
      "nz-2026",
    );
    expect(individual).toHaveLength(0); // no candidate-level evidence yet
    expect(party.every((c) => c.partyId === "nz-2026-party-labour")).toBe(true);
    expect(party.length).toBeGreaterThan(0);
  });
});
