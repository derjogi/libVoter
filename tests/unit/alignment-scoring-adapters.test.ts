import { describe, expect, it } from "vitest";
import {
  claimEvidenceRelationshipSchema,
  createRelationshipCacheKey,
  RELATIONSHIP_CATEGORIES,
} from "@/lib/client/evidence/relationships";
import type { PublishedPassage } from "@/lib/evidence/corpus-publication";
import { SHARED_RELATIONSHIP_CATEGORIES } from "@/lib/evidence/relationship-categories";
import {
  adaptClaimRevisionToScoringClaim,
  adaptRelationshipsToScoringEvidence,
} from "@/lib/scoring/alignment-adapters";
import { voterClaimRevisionSchema } from "@/types/voter-claims.zod";

const canonicalClaim = voterClaimRevisionSchema.parse({
  claimId: "00000000-0000-4000-8000-000000000001",
  revisionId: "00000000-0000-4000-8000-000000000002",
  revision: 3,
  statement: "Fund frequent regional rail",
  conditions: ["with published costings"],
  topicTags: ["transport"],
  proposedImportance: 0.8,
  confirmedImportance: 0.7,
  status: "active",
  sourceResponseId: "response-1",
  createdAt: "2026-07-19T00:00:00.000Z",
});

function passage(
  id: string,
  subject:
    | { subjectType: "candidacy"; candidacyId: string }
    | { subjectType: "person"; personId: string }
    | { subjectType: "official_party"; officialPartyId: string },
): PublishedPassage {
  return {
    id,
    corpusRevisionId: "corpus:r1",
    evidenceSourceId: `source:${id}`,
    subjectType: subject.subjectType,
    candidacyId:
      subject.subjectType === "candidacy" ? subject.candidacyId : null,
    personId: subject.subjectType === "person" ? subject.personId : null,
    officialPartyId:
      subject.subjectType === "official_party" ? subject.officialPartyId : null,
    sourceLineageKey: `lineage:${id}`,
    independenceKey: `independent:${id}`,
    contentRevision: "content-r1",
    contentHash: `hash:${id}`,
    text: `Evidence ${id}`,
    spanStart: 0,
    spanEnd: 10,
    status: "accepted",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    invalidatedAt: null,
    invalidationReason: null,
  };
}

function relationship(
  passageId: string,
  category: "aligned" | "partially-opposed",
) {
  const tuple = {
    claimId: canonicalClaim.claimId,
    claimSemanticRevision: "claim-semantic:r3",
    passageId,
    passageContentRevision: "content-r1",
    classifierVersion: "classifier-v1",
  };
  return claimEvidenceRelationshipSchema.parse({
    ...tuple,
    cacheKey: createRelationshipCacheKey(tuple),
    category,
    interpretationConfidence: 0.8,
    reason: "Fixture interpretation",
  });
}

describe("Spec 023 canonical claim adapter", () => {
  it("adapts numeric revisions and confirmed importance without inventing resolution", () => {
    expect(
      adaptClaimRevisionToScoringClaim(canonicalClaim, { voteLane: "both" }),
    ).toMatchObject({
      id: canonicalClaim.claimId,
      revision: "3",
      confirmedImportance: 0.7,
      resolution: "resolved",
      status: "active",
      voteLane: "both",
    });

    expect(
      adaptClaimRevisionToScoringClaim(
        { ...canonicalClaim, confirmedImportance: null },
        { voteLane: "party" },
      ),
    ).toMatchObject({
      revision: "3",
      confirmedImportance: 0,
      resolution: "unresolved",
      voteLane: "party",
    });
  });
});

describe("Spec 024 relationship and passage adapters", () => {
  it("projects both candidacy and person passages into separate evidence for one electorate candidate", () => {
    const candidacyPassage = passage("passage-candidacy", {
      subjectType: "candidacy",
      candidacyId: "candidacy-1",
    });
    const personPassage = passage("passage-person", {
      subjectType: "person",
      personId: "person-1",
    });
    const partyPassage = passage("passage-party", {
      subjectType: "official_party",
      officialPartyId: "party-1",
    });
    const relationships = [
      relationship(candidacyPassage.id, "aligned"),
      relationship(personPassage.id, "partially-opposed"),
      relationship(partyPassage.id, "aligned"),
    ];
    const passageSignals = Object.fromEntries(
      [candidacyPassage, personPassage, partyPassage].map((item) => [
        item.id,
        { sourceQuality: 0.9, recencyWeight: 0.75 },
      ]),
    );

    const adapted = adaptRelationshipsToScoringEvidence({
      relationships,
      passages: [candidacyPassage, personPassage, partyPassage],
      electorateCandidates: [
        {
          subjectId: "candidate-result-1",
          candidacyId: "candidacy-1",
          personId: "person-1",
        },
      ],
      passageSignals,
    });

    expect(
      adapted
        .filter((item) => item.subjectKind === "candidate")
        .map(({ subjectId, evidenceId, category }) => ({
          subjectId,
          evidenceId,
          category,
        })),
    ).toEqual([
      {
        subjectId: "candidate-result-1",
        evidenceId: candidacyPassage.id,
        category: "aligned",
      },
      {
        subjectId: "candidate-result-1",
        evidenceId: personPassage.id,
        category: "partially-opposed",
      },
    ]);
    expect(adapted[2]).toMatchObject({
      subjectId: "party-1",
      subjectKind: "official-party",
      evidenceId: partyPassage.id,
      sourceQuality: 0.9,
      recencyWeight: 0.75,
    });
  });

  it("uses one shared hyphenated category contract", () => {
    expect(RELATIONSHIP_CATEGORIES).toBe(SHARED_RELATIONSHIP_CATEGORIES);
    expect(SHARED_RELATIONSHIP_CATEGORIES).toContain("partially-aligned");
    expect(SHARED_RELATIONSHIP_CATEGORIES).toContain("partially-opposed");
    expect(
      claimEvidenceRelationshipSchema.safeParse({
        ...relationship("passage-category", "aligned"),
        category: "partially_opposed",
      }).success,
    ).toBe(false);
  });
});
