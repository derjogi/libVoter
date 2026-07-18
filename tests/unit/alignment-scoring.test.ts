import { describe, expect, it } from "vitest";
import type {
  EvidenceRelationship,
  ScoringClaim,
} from "@/lib/scoring/alignment";
import {
  aggregateIndependentEvidence,
  alignmentScoringConfigSchema,
  alignmentScoringResultSchema,
  assessPartyCohesion,
  createAlignmentCacheKey,
  DEFAULT_ALIGNMENT_SCORING_CONFIG,
  rankElectorate,
  rankPartyVote,
  relationshipCategoryValue,
  scoreSubject,
  stableInputHash,
} from "@/lib/scoring/alignment";
import {
  categoricalRelationships,
  claims,
  duplicateRelationships,
  laneRelationships,
  memberDisagreement,
  relationship,
  scoringVersions,
} from "./fixtures/alignment-scoring-golden";

const config = DEFAULT_ALIGNMENT_SCORING_CONFIG;

function scoreCandidate(
  subjectId: string,
  scoringClaims: readonly ScoringClaim[],
  relationships: readonly EvidenceRelationship[],
) {
  return scoreSubject({
    subjectId,
    subjectKind: "candidate",
    claims: scoringClaims,
    relationships,
    lane: "electorate",
    config,
  });
}

describe("versioned scoring contracts", () => {
  it("parses the versioned calibration hypothesis and rejects silent version drift", () => {
    expect(alignmentScoringConfigSchema.parse(config)).toEqual(config);
    expect(
      alignmentScoringConfigSchema.safeParse({ ...config, version: "v2" })
        .success,
    ).toBe(false);
    expect(config.calibrationStatus).toBe("hypothesis-requires-evaluation");
  });

  it("validates a complete versioned lane result", () => {
    const result = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      ...scoringVersions,
      config,
    });

    expect(alignmentScoringResultSchema.safeParse(result).success).toBe(true);
    expect(result.scoringConfigVersion).toBe("v1");
  });
});

describe("categorical mapping and bounded independent evidence", () => {
  it.each([
    ["aligned", 1],
    ["partially-aligned", 0.5],
    ["unclear", null],
    ["partially-opposed", -0.5],
    ["opposed", -1],
  ] as const)(
    "maps %s without treating confidence as category meaning",
    (category, value) => {
      expect(relationshipCategoryValue(category, config)).toBe(value);
    },
  );

  it("distinguishes supporting, opposing, and unclear evidence", () => {
    const support = scoreCandidate(
      "candidate-support",
      [claims.support],
      categoricalRelationships,
    );
    const opposition = scoreCandidate(
      "candidate-oppose",
      [claims.support],
      categoricalRelationships,
    );
    const unclear = scoreCandidate(
      "candidate-unclear",
      [claims.support],
      categoricalRelationships,
    );

    expect(support).toMatchObject({
      score: 100,
      coverage: 1,
      status: "usable",
    });
    expect(opposition).toMatchObject({
      score: 0,
      coverage: 1,
      status: "usable",
    });
    expect(unclear).toMatchObject({
      score: 50,
      coverage: 0,
      status: "provisional",
    });
  });

  it("deduplicates copied passages and caps independent evidence", () => {
    const baseline = aggregateIndependentEvidence(
      duplicateRelationships,
      config,
    );
    const withVolume = aggregateIndependentEvidence(
      [
        ...duplicateRelationships,
        ...Array.from({ length: 20 }, (_, index) => ({
          ...duplicateRelationships[2],
          id: `copy-extra-${index}`,
          evidenceId: `evidence-copy-extra-${index}`,
        })),
        relationship(
          "independent-weak",
          claims.support.id,
          "candidate-duplicate",
          "opposed",
          {
            interpretationConfidence: 0.1,
          },
        ),
        relationship(
          "independent-third",
          claims.support.id,
          "candidate-duplicate",
          "opposed",
          {
            interpretationConfidence: 0.05,
          },
        ),
      ],
      config,
    );

    expect(baseline).toEqual({
      adjustedCompatibility: 1,
      knownAgreement: 1,
      coverage: 1,
      retainedEvidenceIds: ["evidence-original"],
    });
    expect(withVolume.retainedEvidenceIds).toEqual([
      "evidence-original",
      "evidence-independent-weak",
    ]);
    expect(withVolume.adjustedCompatibility).toBeCloseTo(0.909091, 5);
  });

  it("uses source, recency and interpretation confidence only as bounded signal", () => {
    const result = aggregateIndependentEvidence(
      [
        relationship(
          "fresh-secondary",
          claims.support.id,
          "candidate-a",
          "aligned",
          {
            interpretationConfidence: 0.8,
            sourceQuality: 0.5,
            recencyWeight: 0.5,
          },
        ),
      ],
      config,
    );

    expect(result).toMatchObject({
      knownAgreement: 1,
      coverage: 0.2,
      adjustedCompatibility: 0.6,
    });
  });
});

describe("claim weighting, unknown evidence, and topic projections", () => {
  it("weights each active resolved claim by confirmed importance exactly once", () => {
    const relationships = [
      relationship("support-main", claims.support.id, "candidate-a", "aligned"),
      relationship(
        "oppose-tradeoff",
        claims.tradeOff.id,
        "candidate-a",
        "opposed",
      ),
      relationship(
        "ignored-unresolved",
        claims.unresolved.id,
        "candidate-a",
        "opposed",
      ),
    ];
    const result = scoreCandidate(
      "candidate-a",
      [claims.support, claims.tradeOff, claims.unresolved],
      relationships,
    );

    expect(result?.score).toBe(80);
    expect(
      result?.contributions.map(({ claimId, weight }) => [claimId, weight]),
    ).toEqual([
      [claims.support.id, 1],
      [claims.tradeOff.id, 0.25],
    ]);
    expect(result?.topics.map((topic) => topic.topic)).toEqual([
      "rates",
      "transport",
    ]);
  });

  it("represents negation and corrections in claims without parsing text or double-scoring history", () => {
    const result = scoreCandidate(
      "candidate-correction",
      [claims.negated, claims.correctedOld, claims.corrected],
      [
        relationship(
          "negation-aligned",
          claims.negated.id,
          "candidate-correction",
          "aligned",
        ),
        relationship(
          "old-opposed",
          claims.correctedOld.id,
          "candidate-correction",
          "opposed",
        ),
        relationship(
          "new-aligned",
          claims.corrected.id,
          "candidate-correction",
          "aligned",
        ),
      ],
    );

    expect(result?.score).toBe(100);
    expect(result?.contributions.map((item) => item.claimId)).toEqual([
      claims.corrected.id,
      claims.negated.id,
    ]);
  });

  it("keeps entirely missing evidence unknown with neutral compatibility and separate zero coverage", () => {
    const result = scoreCandidate("candidate-sparse", [claims.support], []);

    expect(result).toMatchObject({
      score: 50,
      rawScore: 50,
      coverage: 0,
      confidence: 0,
      status: "provisional",
    });
    expect(result?.contributions[0]).toMatchObject({
      adjustedCompatibility: 0.5,
      coverage: 0,
      knownAgreement: null,
    });
  });
});

describe("lane separation and electorate score projection", () => {
  it.each([
    [
      "electorate",
      () =>
        rankElectorate({
          candidates: [{ candidateId: "candidate-a", partyId: "party-a" }],
          claims: [claims.unresolved, claims.correctedOld],
          relationships: laneRelationships,
          cohesionSignals: [],
          ...scoringVersions,
          config,
        }),
    ],
    [
      "party",
      () =>
        rankPartyVote({
          partyIds: ["party-a"],
          claims: [claims.unresolved, claims.correctedOld],
          relationships: laneRelationships,
          cohesionSignals: [],
          ...scoringVersions,
          config,
        }),
    ],
  ] as const)(
    "returns a lane-level no-score result for %s when no resolved active claim is eligible",
    (_lane, rank) => {
      const result = rank();

      expect(result).toMatchObject({
        status: "no-score",
        reason: "no-eligible-resolved-claims",
        rankingConfidence: 0,
        margin: 0,
        results: [],
      });
      expect(alignmentScoringResultSchema.safeParse(result).success).toBe(true);
    },
  );

  it("keeps personal, official-party, party-vote and combined results separate", () => {
    const electorate = rankElectorate({
      candidates: [{ candidateId: "candidate-a", partyId: "party-a" }],
      claims: [claims.support],
      relationships: laneRelationships,
      cohesionSignals: [],
      ...scoringVersions,
      config,
    });
    const partyVote = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      ...scoringVersions,
      config,
    });

    expect(electorate.results[0]).toMatchObject({
      subjectId: "candidate-a",
      personal: { score: 100 },
      officialParty: { score: 0 },
      combined: { score: 50, personalWeight: 0.5, partyWeight: 0.5 },
    });
    expect(partyVote.results[0].score).toBe(0);
  });

  it("shifts combined weighting toward weighted claim coverage within the configured cap", () => {
    const electorate = rankElectorate({
      candidates: [{ candidateId: "candidate-a", partyId: "party-a" }],
      claims: [claims.support],
      relationships: [
        relationship(
          "candidate-full",
          claims.support.id,
          "candidate-a",
          "aligned",
        ),
        relationship("party-half", claims.support.id, "party-a", "opposed", {
          subjectKind: "official-party",
          interpretationConfidence: 0.5,
        }),
      ],
      cohesionSignals: [],
      ...scoringVersions,
      config,
    });

    expect(electorate.results[0].combined).toMatchObject({
      score: 72,
      coverage: 0.8125,
      personalWeight: 0.625,
      partyWeight: 0.375,
    });
  });

  it("does not fabricate a party score for independents", () => {
    const result = rankElectorate({
      candidates: [{ candidateId: "candidate-independent" }],
      claims: [claims.support],
      relationships: laneRelationships,
      cohesionSignals: [],
      ...scoringVersions,
      config,
    }).results[0];

    expect(result.officialParty).toBeNull();
    expect(result.cohesion).toBeNull();
    expect(result.combined.score).toBe(result.personal?.score);
    expect(result.combined.personalWeight).toBe(1);
    expect(result.combined.partyWeight).toBe(0);
  });
});

describe("ranking confidence, margins, ties and provisional ordering", () => {
  it("uses raw score, then coverage, then stable id and reports the unrounded top margin", () => {
    const result = rankElectorate({
      candidates: [
        { candidateId: "candidate-z" },
        { candidateId: "candidate-b" },
        { candidateId: "candidate-a" },
      ],
      claims: [claims.support],
      relationships: [
        relationship(
          "z-partial",
          claims.support.id,
          "candidate-z",
          "partially-aligned",
          {
            interpretationConfidence: 0.333,
          },
        ),
        relationship("a-support", claims.support.id, "candidate-a", "aligned"),
        relationship("b-support", claims.support.id, "candidate-b", "aligned"),
      ],
      cohesionSignals: [],
      ...scoringVersions,
      config,
    });

    expect(result.results.map((item) => item.subjectId)).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-z",
    ]);
    expect(result.margin).toBe(0);
    expect(result.rankingConfidence).toBe(70);
  });

  it("orders by combined compatibility even when the higher score is provisional", () => {
    const result = rankElectorate({
      candidates: [
        { candidateId: "candidate-known" },
        { candidateId: "candidate-sparse" },
      ],
      claims: [claims.support],
      relationships: [
        relationship(
          "known-opposed",
          claims.support.id,
          "candidate-known",
          "partially-opposed",
        ),
        relationship(
          "sparse-aligned",
          claims.support.id,
          "candidate-sparse",
          "aligned",
          {
            interpretationConfidence: 0.1,
          },
        ),
      ],
      cohesionSignals: [],
      ...scoringVersions,
      config,
    });

    expect(
      result.results.map(({ subjectId, status }) => [subjectId, status]),
    ).toEqual([
      ["candidate-sparse", "provisional"],
      ["candidate-known", "usable"],
    ]);
  });
});

describe("party cohesion", () => {
  it("reduces confidence and cites a warning without changing official compatibility", () => {
    const before = scoreSubject({
      subjectId: "party-a",
      subjectKind: "official-party",
      claims: [claims.support],
      relationships: laneRelationships,
      lane: "party",
      config,
    });
    const cohesion = assessPartyCohesion("party-a", memberDisagreement, config);
    const withoutCohesion = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      cohesionSignals: [],
      ...scoringVersions,
      config,
    });
    const ranked = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      cohesionSignals: memberDisagreement,
      ...scoringVersions,
      config,
    });

    expect(cohesion).toMatchObject({
      warning: true,
      disagreement: 1,
      confidenceMultiplier: 0.75,
      evidenceIds: ["evidence-member-disagreement"],
    });
    expect(ranked.results[0].score).toBe(before?.score);
    expect(ranked.results[0].confidence).toBe(75);
    expect(ranked.results[0].cohesion).toEqual(cohesion);
    expect(ranked.cacheKey).not.toBe(withoutCohesion.cacheKey);
  });
});

describe("stable input hash and cache key", () => {
  it("invalidates a ranked result when an effective scoring constant changes without a version-label change", () => {
    const baseline = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      ...scoringVersions,
      config,
    });
    const changed = rankPartyVote({
      partyIds: ["party-a"],
      claims: [claims.support],
      relationships: laneRelationships,
      ...scoringVersions,
      config: {
        ...config,
        provisionalCoverageThreshold: 0.36,
      },
    });

    expect(changed.scoringConfigVersion).toBe(baseline.scoringConfigVersion);
    expect(changed.cacheKey).not.toBe(baseline.cacheKey);
  });

  it("is stable across object-key and record ordering but changes with relevant versions", () => {
    const first = createAlignmentCacheKey({
      claims: [claims.tradeOff, claims.support],
      relationships: [...laneRelationships].reverse(),
      ...scoringVersions,
      scoringConfig: config,
    });
    const reordered = createAlignmentCacheKey({
      scoringConfig: config,
      corpusRevision: scoringVersions.corpusRevision,
      relationships: laneRelationships,
      profileVersion: scoringVersions.profileVersion,
      claims: [claims.support, claims.tradeOff],
    });
    const changedCorpus = createAlignmentCacheKey({
      claims: [claims.support, claims.tradeOff],
      relationships: laneRelationships,
      ...scoringVersions,
      corpusRevision: "corpus-golden-v2",
      scoringConfig: config,
    });

    expect(first).toBe(reordered);
    expect(changedCorpus).not.toBe(first);
    expect(stableInputHash({ b: 2, a: 1 })).toBe(
      stableInputHash({ a: 1, b: 2 }),
    );
    expect(first).toMatch(/^alignment:v1:[0-9a-f]{16}$/);
  });
});
