import { describe, expect, it } from "vitest";
import { classifyRelationshipMock } from "@/lib/client/evidence/mock-classifier";
import {
  claimEvidenceRelationshipSchema,
  createClaimSemanticRevision,
  createRelationshipCacheKey,
  projectRelationshipCache,
  RELATIONSHIP_CATEGORIES,
} from "@/lib/client/evidence/relationships";
import {
  planRelationshipWork,
  relationshipWorkProgress,
} from "@/lib/client/evidence/work-plan";

const tuple = {
  claimId: "claim-1",
  claimSemanticRevision: "sem-1",
  passageId: "passage-1",
  passageContentRevision: "passage-r1",
  classifierVersion: "mock-v1",
};

describe("pairwise claim/evidence relationship contract", () => {
  it("accepts exactly the five categories with separate confidence and reason", () => {
    expect(RELATIONSHIP_CATEGORIES).toEqual([
      "aligned",
      "partially-aligned",
      "unclear",
      "partially-opposed",
      "opposed",
    ]);
    for (const category of RELATIONSHIP_CATEGORIES) {
      expect(
        claimEvidenceRelationshipSchema.parse({
          ...tuple,
          cacheKey: createRelationshipCacheKey(tuple),
          category,
          interpretationConfidence: 0.75,
          reason: "A cited interpretation.",
        }).category,
      ).toBe(category);
    }
    expect(
      claimEvidenceRelationshipSchema.safeParse({
        ...tuple,
        cacheKey: createRelationshipCacheKey(tuple),
        category: "topical",
        interpretationConfidence: 1.2,
        reason: "invalid",
      }).success,
    ).toBe(false);
  });

  it("builds cache keys only from semantic and content/classifier revisions", () => {
    const firstSemanticRevision = createClaimSemanticRevision({
      statement: "Fund regional rail",
      conditions: ["if independently costed"],
      topicTags: ["transport"],
    });
    const retaggedSemanticRevision = createClaimSemanticRevision({
      statement: "Fund regional rail",
      conditions: ["if independently costed"],
      topicTags: ["climate", "infrastructure"],
    });
    expect(retaggedSemanticRevision).toBe(firstSemanticRevision);

    const key = createRelationshipCacheKey({
      ...tuple,
      claimSemanticRevision: firstSemanticRevision,
    });
    expect(
      createRelationshipCacheKey({
        ...tuple,
        claimSemanticRevision: retaggedSemanticRevision,
      }),
    ).toBe(key);
    expect(
      createRelationshipCacheKey({
        ...tuple,
        passageContentRevision: "passage-r2",
        claimSemanticRevision: firstSemanticRevision,
      }),
    ).not.toBe(key);
  });

  it("projects relationships into browser-local cache entries without persistence fields", () => {
    const relationship = classifyRelationshipMock({
      ...tuple,
      claimText: "Support protected cycle lanes",
      passageText: "We support protected cycle lanes on arterial roads.",
    });
    const cache = projectRelationshipCache([relationship]);

    expect(cache[relationship.cacheKey]).toEqual(relationship);
    expect(relationship).not.toHaveProperty("sessionId");
    expect(relationship).not.toHaveProperty("createdAt");
  });
});

describe("incremental classification work", () => {
  it("reuses cache hits and schedules only changed tuples", () => {
    const cached = classifyRelationshipMock({
      ...tuple,
      claimText: "Support protected cycle lanes",
      passageText: "We support protected cycle lanes.",
    });
    const changed = { ...tuple, passageId: "passage-2" };
    const plan = planRelationshipWork([tuple, changed], {
      [cached.cacheKey]: cached,
    });

    expect(plan.reused.map((entry) => entry.passageId)).toEqual(["passage-1"]);
    expect(plan.pending).toEqual([changed]);
    expect(relationshipWorkProgress(plan)).toEqual({
      completed: 1,
      pending: 1,
      total: 2,
      ratio: 0.5,
    });
  });

  it("mock classifier is deterministic and distinguishes support, opposition, and unclear", () => {
    const aligned = classifyRelationshipMock({
      ...tuple,
      claimText: "Support protected cycle lanes",
      passageText: "We support protected cycle lanes.",
    });
    const opposed = classifyRelationshipMock({
      ...tuple,
      passageId: "passage-2",
      claimText: "Support protected cycle lanes",
      passageText: "We oppose protected cycle lanes.",
    });
    const unclear = classifyRelationshipMock({
      ...tuple,
      passageId: "passage-3",
      claimText: "Support protected cycle lanes",
      passageText: "The council discussed its annual report.",
    });

    expect(aligned.category).toBe("aligned");
    expect(opposed.category).toBe("opposed");
    expect(unclear.category).toBe("unclear");
    expect(
      classifyRelationshipMock({
        ...tuple,
        claimText: "Support protected cycle lanes",
        passageText: "We support protected cycle lanes.",
      }),
    ).toEqual(aligned);
  });
});
