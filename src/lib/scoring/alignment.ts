import { z } from "zod";
import type { SharedRelationshipCategory } from "@/lib/evidence/relationship-categories";

const unitInterval = z.number().min(0).max(1);

export const alignmentScoringConfigSchema = z
  .object({
    schemaVersion: z.literal("alignment-scoring-config/v1"),
    version: z.literal("v1"),
    calibrationStatus: z.literal("hypothesis-requires-evaluation"),
    maxIndependentEvidence: z.literal(2),
    relationshipValues: z
      .object({
        aligned: z.literal(1),
        "partially-aligned": z.literal(0.5),
        unclear: z.null(),
        "partially-opposed": z.literal(-0.5),
        opposed: z.literal(-1),
      })
      .strict(),
    provisionalCoverageThreshold: unitInterval,
    combined: z
      .object({
        baselinePersonalWeight: unitInterval,
        coverageShiftScale: unitInterval,
        maximumShift: unitInterval,
      })
      .strict(),
    rankingConfidence: z
      .object({
        evidenceCoverageWeight: unitInterval,
        topicCoverageWeight: unitInterval,
        marginStabilityWeight: unitInterval,
        marginFullScalePoints: z.number().positive(),
      })
      .strict(),
    cohesion: z
      .object({
        warningThreshold: unitInterval,
        maximumConfidenceReduction: unitInterval,
      })
      .strict(),
  })
  .strict();

export type AlignmentScoringConfig = z.infer<
  typeof alignmentScoringConfigSchema
>;

/**
 * V1 values are explicit, versioned hypotheses. They are locked for deterministic
 * fixtures, not asserted to be calibrated political truth.
 */
export const DEFAULT_ALIGNMENT_SCORING_CONFIG: AlignmentScoringConfig = {
  schemaVersion: "alignment-scoring-config/v1",
  version: "v1",
  calibrationStatus: "hypothesis-requires-evaluation",
  maxIndependentEvidence: 2,
  relationshipValues: {
    aligned: 1,
    "partially-aligned": 0.5,
    unclear: null,
    "partially-opposed": -0.5,
    opposed: -1,
  },
  provisionalCoverageThreshold: 0.35,
  combined: {
    baselinePersonalWeight: 0.5,
    coverageShiftScale: 0.25,
    maximumShift: 0.15,
  },
  rankingConfidence: {
    evidenceCoverageWeight: 0.4,
    topicCoverageWeight: 0.3,
    marginStabilityWeight: 0.3,
    marginFullScalePoints: 20,
  },
  cohesion: {
    warningThreshold: 0.35,
    maximumConfidenceReduction: 0.25,
  },
};

export type RelationshipCategory = SharedRelationshipCategory;
export type VoteLane = "party" | "electorate" | "both";
export type ScoreLane = "party" | "electorate";
export type SubjectKind = "candidate" | "official-party";

export interface ScoringClaim {
  id: string;
  revision: string;
  statement: string;
  topicTags: readonly string[];
  confirmedImportance: number;
  voteLane: VoteLane;
  status: "active" | "superseded" | "retracted";
  resolution: "resolved" | "unresolved";
}

export interface EvidenceRelationship {
  id: string;
  claimId: string;
  subjectId: string;
  subjectKind: SubjectKind | "party-member";
  category: RelationshipCategory;
  interpretationConfidence: number;
  sourceQuality: number;
  recencyWeight: number;
  independenceKey: string;
  evidenceId: string;
}

export interface CohesionSignal {
  id: string;
  partyId: string;
  memberId: string;
  category: RelationshipCategory;
  interpretationConfidence: number;
  sourceQuality: number;
  recencyWeight: number;
  independenceKey: string;
  evidenceId: string;
}

export interface EvidenceAggregate {
  adjustedCompatibility: number;
  knownAgreement: number | null;
  coverage: number;
  retainedEvidenceIds: string[];
}

const preferenceContributionSchema = z
  .object({
    claimId: z.string(),
    revision: z.string(),
    weight: unitInterval,
    adjustedCompatibility: unitInterval,
    knownAgreement: unitInterval.nullable(),
    coverage: unitInterval,
    evidenceIds: z.array(z.string()),
    topicTags: z.array(z.string()),
  })
  .strict();

const topicContributionSchema = z
  .object({
    topic: z.string(),
    score: z.number().min(0).max(100),
    coverage: unitInterval,
    weight: z.number().nonnegative(),
    claimIds: z.array(z.string()),
  })
  .strict();

const localAlignmentScoreSchema = z
  .object({
    rawScore: z.number().min(0).max(100),
    score: z.number().int().min(0).max(100),
    coverage: unitInterval,
    topicCoverage: unitInterval,
    confidence: z.number().int().min(0).max(100),
    status: z.enum(["usable", "provisional"]),
    contributions: z.array(preferenceContributionSchema),
    topics: z.array(topicContributionSchema),
  })
  .strict();

const cohesionAssessmentSchema = z
  .object({
    warning: z.boolean(),
    disagreement: unitInterval,
    confidenceMultiplier: unitInterval,
    evidenceIds: z.array(z.string()),
  })
  .strict();

const combinedAlignmentScoreSchema = localAlignmentScoreSchema.extend({
  personalWeight: unitInterval,
  partyWeight: unitInterval,
});

const electorateSubjectResultSchema = z
  .object({
    subjectId: z.string(),
    partyId: z.string().nullable(),
    personal: localAlignmentScoreSchema.nullable(),
    officialParty: localAlignmentScoreSchema.nullable(),
    combined: combinedAlignmentScoreSchema,
    cohesion: cohesionAssessmentSchema.nullable(),
    status: z.enum(["usable", "provisional"]),
  })
  .strict();

const partySubjectResultSchema = localAlignmentScoreSchema
  .extend({
    subjectId: z.string(),
    cohesion: cohesionAssessmentSchema,
  })
  .strict();

const resultEnvelopeSchema = z.object({
  schemaVersion: z.literal("alignment-scoring-result/v1"),
  resultVersion: z.literal("v1"),
  scoringConfigVersion: z.literal("v1"),
  profileVersion: z.string(),
  corpusRevision: z.string(),
  inputHash: z.string().regex(/^[0-9a-f]{16}$/),
  cacheKey: z.string().regex(/^alignment:v1:[0-9a-f]{16}$/),
  status: z.enum(["scored", "no-score"]),
  reason: z.literal("no-eligible-resolved-claims").nullable(),
  rankingConfidence: z.number().int().min(0).max(100),
  margin: z.number().nonnegative(),
});

export const alignmentScoringResultSchema = z.discriminatedUnion("lane", [
  resultEnvelopeSchema
    .extend({
      lane: z.literal("electorate"),
      results: z.array(electorateSubjectResultSchema),
    })
    .strict(),
  resultEnvelopeSchema
    .extend({
      lane: z.literal("party"),
      results: z.array(partySubjectResultSchema),
    })
    .strict(),
]);

export type PreferenceContribution = z.infer<
  typeof preferenceContributionSchema
>;
export type TopicContribution = z.infer<typeof topicContributionSchema>;
export type LocalAlignmentScore = z.infer<typeof localAlignmentScoreSchema>;
export type CohesionAssessment = z.infer<typeof cohesionAssessmentSchema>;
export type CombinedAlignmentScore = z.infer<
  typeof combinedAlignmentScoreSchema
>;
export type AlignmentScoringResult = z.infer<
  typeof alignmentScoringResultSchema
>;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function evidenceSignal(item: {
  interpretationConfidence: number;
  sourceQuality: number;
  recencyWeight: number;
}): number {
  return (
    clamp(item.interpretationConfidence) *
    clamp(item.sourceQuality) *
    clamp(item.recencyWeight)
  );
}

export function relationshipCategoryValue(
  category: RelationshipCategory,
  config: AlignmentScoringConfig = DEFAULT_ALIGNMENT_SCORING_CONFIG,
): number | null {
  return config.relationshipValues[category];
}

interface AggregateRelationship {
  id: string;
  category: RelationshipCategory;
  interpretationConfidence: number;
  sourceQuality: number;
  recencyWeight: number;
  independenceKey: string;
  evidenceId: string;
}

export function aggregateIndependentEvidence(
  relationships: readonly AggregateRelationship[],
  config: AlignmentScoringConfig = DEFAULT_ALIGNMENT_SCORING_CONFIG,
): EvidenceAggregate {
  const strongestByIndependentSource = new Map<
    string,
    AggregateRelationship & { signal: number; agreement: number }
  >();

  for (const relationship of relationships) {
    const categoryValue = relationshipCategoryValue(
      relationship.category,
      config,
    );
    const signal = evidenceSignal(relationship);
    if (categoryValue === null || signal <= 0) continue;

    const candidate = {
      ...relationship,
      signal,
      agreement: (categoryValue + 1) / 2,
    };
    const current = strongestByIndependentSource.get(
      relationship.independenceKey,
    );
    if (
      !current ||
      candidate.signal > current.signal ||
      (candidate.signal === current.signal && candidate.id < current.id)
    ) {
      strongestByIndependentSource.set(relationship.independenceKey, candidate);
    }
  }

  const retained = [...strongestByIndependentSource.values()]
    .sort(
      (left, right) =>
        right.signal - left.signal || left.id.localeCompare(right.id),
    )
    .slice(0, config.maxIndependentEvidence);

  if (retained.length === 0) {
    return {
      adjustedCompatibility: 0.5,
      knownAgreement: null,
      coverage: 0,
      retainedEvidenceIds: [],
    };
  }

  const totalSignal = retained.reduce((sum, item) => sum + item.signal, 0);
  const knownAgreement =
    retained.reduce((sum, item) => sum + item.agreement * item.signal, 0) /
    totalSignal;
  const coverage = Math.max(...retained.map((item) => item.signal));

  return {
    adjustedCompatibility: roundTo(0.5 + coverage * (knownAgreement - 0.5)),
    knownAgreement: roundTo(knownAgreement),
    coverage: roundTo(coverage),
    retainedEvidenceIds: retained.map((item) => item.evidenceId),
  };
}

function claimAppliesToLane(claim: ScoringClaim, lane: ScoreLane): boolean {
  return claim.voteLane === "both" || claim.voteLane === lane;
}

function eligibleClaims(
  claims: readonly ScoringClaim[],
  lane: ScoreLane,
): ScoringClaim[] {
  return claims
    .filter(
      (claim) =>
        claim.status === "active" &&
        claim.resolution === "resolved" &&
        claim.confirmedImportance > 0 &&
        claimAppliesToLane(claim, lane),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildTopics(
  contributions: readonly PreferenceContribution[],
): TopicContribution[] {
  const topics = new Map<string, PreferenceContribution[]>();
  for (const contribution of contributions) {
    const tags = [...new Set(contribution.topicTags)].sort();
    for (const topic of tags) {
      const existing = topics.get(topic) ?? [];
      existing.push(contribution);
      topics.set(topic, existing);
    }
  }

  return [...topics.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topic, items]) => {
      const weight = items.reduce((sum, item) => sum + item.weight, 0);
      return {
        topic,
        score: Math.round(
          (100 *
            items.reduce(
              (sum, item) => sum + item.weight * item.adjustedCompatibility,
              0,
            )) /
            weight,
        ),
        coverage: roundTo(
          items.reduce((sum, item) => sum + item.weight * item.coverage, 0) /
            weight,
        ),
        weight: roundTo(weight),
        claimIds: items.map((item) => item.claimId).sort(),
      };
    });
}

function scoreFromContributions(
  contributions: PreferenceContribution[],
  config: AlignmentScoringConfig,
): LocalAlignmentScore | null {
  if (contributions.length === 0) return null;

  const totalWeight = contributions.reduce((sum, item) => sum + item.weight, 0);
  const rawScore = roundTo(
    (100 *
      contributions.reduce(
        (sum, item) => sum + item.weight * item.adjustedCompatibility,
        0,
      )) /
      totalWeight,
  );
  const coverage = roundTo(
    contributions.reduce((sum, item) => sum + item.weight * item.coverage, 0) /
      totalWeight,
  );
  const topicCoverage = roundTo(
    contributions.reduce(
      (sum, item) => sum + item.weight * (item.coverage > 0 ? 1 : 0),
      0,
    ) / totalWeight,
  );

  return {
    rawScore,
    score: Math.round(rawScore),
    coverage,
    topicCoverage,
    confidence: Math.round(100 * coverage),
    status:
      coverage < config.provisionalCoverageThreshold ? "provisional" : "usable",
    contributions,
    topics: buildTopics(contributions),
  };
}

export function scoreSubject(input: {
  subjectId: string;
  subjectKind: SubjectKind;
  claims: readonly ScoringClaim[];
  relationships: readonly EvidenceRelationship[];
  lane: ScoreLane;
  config?: AlignmentScoringConfig;
}): LocalAlignmentScore | null {
  const config = input.config ?? DEFAULT_ALIGNMENT_SCORING_CONFIG;
  const contributions = eligibleClaims(input.claims, input.lane).map(
    (claim) => {
      const aggregate = aggregateIndependentEvidence(
        input.relationships.filter(
          (relationship) =>
            relationship.subjectId === input.subjectId &&
            relationship.subjectKind === input.subjectKind &&
            relationship.claimId === claim.id,
        ),
        config,
      );
      return {
        claimId: claim.id,
        revision: claim.revision,
        weight: clamp(claim.confirmedImportance),
        adjustedCompatibility: aggregate.adjustedCompatibility,
        knownAgreement: aggregate.knownAgreement,
        coverage: aggregate.coverage,
        evidenceIds: aggregate.retainedEvidenceIds,
        topicTags: [...claim.topicTags].sort(),
      } satisfies PreferenceContribution;
    },
  );

  return scoreFromContributions(contributions, config);
}

export function assessPartyCohesion(
  partyId: string,
  signals: readonly CohesionSignal[],
  config: AlignmentScoringConfig = DEFAULT_ALIGNMENT_SCORING_CONFIG,
): CohesionAssessment {
  const aggregate = aggregateIndependentEvidence(
    signals.filter((signal) => signal.partyId === partyId),
    config,
  );
  if (aggregate.knownAgreement === null) {
    return {
      warning: false,
      disagreement: 0,
      confidenceMultiplier: 1,
      evidenceIds: [],
    };
  }

  const disagreement = roundTo(
    aggregate.coverage * (1 - aggregate.knownAgreement),
  );
  return {
    warning: disagreement >= config.cohesion.warningThreshold,
    disagreement,
    confidenceMultiplier: roundTo(
      1 - config.cohesion.maximumConfidenceReduction * disagreement,
    ),
    evidenceIds: aggregate.retainedEvidenceIds,
  };
}

function withCohesionConfidence(
  score: LocalAlignmentScore,
  cohesion: CohesionAssessment,
): LocalAlignmentScore {
  return {
    ...score,
    confidence: Math.round(score.confidence * cohesion.confidenceMultiplier),
  };
}

function blendContribution(
  personal: PreferenceContribution,
  party: PreferenceContribution,
  personalWeight: number,
  partyWeight: number,
): PreferenceContribution {
  const knownSignals = [
    personal.knownAgreement === null
      ? null
      : {
          agreement: personal.knownAgreement,
          signal: personal.coverage * personalWeight,
        },
    party.knownAgreement === null
      ? null
      : {
          agreement: party.knownAgreement,
          signal: party.coverage * partyWeight,
        },
  ].filter(
    (item): item is { agreement: number; signal: number } => item !== null,
  );
  const totalSignal = knownSignals.reduce((sum, item) => sum + item.signal, 0);

  return {
    ...personal,
    adjustedCompatibility: roundTo(
      personal.adjustedCompatibility * personalWeight +
        party.adjustedCompatibility * partyWeight,
    ),
    knownAgreement:
      totalSignal === 0
        ? null
        : roundTo(
            knownSignals.reduce(
              (sum, item) => sum + item.agreement * item.signal,
              0,
            ) / totalSignal,
          ),
    coverage: roundTo(
      personal.coverage * personalWeight + party.coverage * partyWeight,
    ),
    evidenceIds: [
      ...new Set([...personal.evidenceIds, ...party.evidenceIds]),
    ].sort(),
  };
}

function combineScores(
  personal: LocalAlignmentScore,
  party: LocalAlignmentScore | null,
  config: AlignmentScoringConfig,
): CombinedAlignmentScore {
  if (!party) {
    return {
      ...personal,
      personalWeight: 1,
      partyWeight: 0,
    };
  }

  const shift = clamp(
    (personal.coverage - party.coverage) * config.combined.coverageShiftScale,
    -config.combined.maximumShift,
    config.combined.maximumShift,
  );
  const personalWeight = roundTo(
    config.combined.baselinePersonalWeight + shift,
  );
  const partyWeight = roundTo(1 - personalWeight);
  const partyContributions = new Map(
    party.contributions.map((contribution) => [
      contribution.claimId,
      contribution,
    ]),
  );
  const contributions = personal.contributions.map((contribution) =>
    blendContribution(
      contribution,
      partyContributions.get(contribution.claimId) ?? {
        ...contribution,
        adjustedCompatibility: 0.5,
        knownAgreement: null,
        coverage: 0,
        evidenceIds: [],
      },
      personalWeight,
      partyWeight,
    ),
  );
  const combined = scoreFromContributions(contributions, config);
  if (!combined)
    throw new Error("Combined score requires at least one contribution");

  return {
    ...combined,
    confidence: Math.round(
      personal.confidence * personalWeight + party.confidence * partyWeight,
    ),
    personalWeight,
    partyWeight,
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function stableInputHash(value: unknown): string {
  const serialized = canonicalize(value);
  let hash = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  for (const byte of new TextEncoder().encode(serialized)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function createAlignmentCacheKey(input: {
  claims: readonly ScoringClaim[];
  relationships: readonly EvidenceRelationship[];
  cohesionSignals?: readonly CohesionSignal[];
  subjectIds?: readonly string[];
  profileVersion: string;
  corpusRevision: string;
  scoringConfig: AlignmentScoringConfig;
}): string {
  const normalized = {
    ...input,
    scoringConfig: alignmentScoringConfigSchema.parse(input.scoringConfig),
    claims: [...input.claims].sort((left, right) =>
      `${left.id}:${left.revision}`.localeCompare(
        `${right.id}:${right.revision}`,
      ),
    ),
    relationships: [...input.relationships].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    cohesionSignals: [...(input.cohesionSignals ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    subjectIds: [...(input.subjectIds ?? [])].sort(),
  };
  return `alignment:${input.scoringConfig.version}:${stableInputHash(normalized)}`;
}

function rankingMetrics(
  scores: readonly {
    rawScore: number;
    coverage: number;
    topicCoverage: number;
  }[],
  config: AlignmentScoringConfig,
): { margin: number; rankingConfidence: number } {
  if (scores.length === 0) return { margin: 0, rankingConfidence: 0 };
  const margin =
    scores.length < 2 ? 0 : roundTo(scores[0].rawScore - scores[1].rawScore);
  const marginStability = clamp(
    margin / config.rankingConfidence.marginFullScalePoints,
  );
  const top = scores[0];
  return {
    margin,
    rankingConfidence: Math.round(
      100 *
        (config.rankingConfidence.evidenceCoverageWeight * top.coverage +
          config.rankingConfidence.topicCoverageWeight * top.topicCoverage +
          config.rankingConfidence.marginStabilityWeight * marginStability),
    ),
  };
}

function envelope(input: {
  lane: ScoreLane;
  profileVersion: string;
  corpusRevision: string;
  claims: readonly ScoringClaim[];
  relationships: readonly EvidenceRelationship[];
  cohesionSignals: readonly CohesionSignal[];
  subjectIds: readonly string[];
  config: AlignmentScoringConfig;
}) {
  const cacheKey = createAlignmentCacheKey({
    claims: input.claims,
    relationships: input.relationships,
    cohesionSignals: input.cohesionSignals,
    subjectIds: input.subjectIds,
    profileVersion: input.profileVersion,
    corpusRevision: input.corpusRevision,
    scoringConfig: input.config,
  });
  return {
    schemaVersion: "alignment-scoring-result/v1" as const,
    resultVersion: "v1" as const,
    scoringConfigVersion: input.config.version,
    profileVersion: input.profileVersion,
    corpusRevision: input.corpusRevision,
    inputHash: cacheKey.slice(cacheKey.lastIndexOf(":") + 1),
    cacheKey,
    lane: input.lane,
  };
}

export function rankElectorate(input: {
  candidates: readonly { candidateId: string; partyId?: string }[];
  claims: readonly ScoringClaim[];
  relationships: readonly EvidenceRelationship[];
  cohesionSignals?: readonly CohesionSignal[];
  profileVersion: string;
  corpusRevision: string;
  config?: AlignmentScoringConfig;
}) {
  const config = input.config ?? DEFAULT_ALIGNMENT_SCORING_CONFIG;
  const resultEnvelope = envelope({
    lane: "electorate",
    profileVersion: input.profileVersion,
    corpusRevision: input.corpusRevision,
    claims: input.claims,
    relationships: input.relationships,
    cohesionSignals: input.cohesionSignals ?? [],
    subjectIds: input.candidates.map(
      (candidate) =>
        `${candidate.candidateId}:${candidate.partyId ?? "independent"}`,
    ),
    config,
  });
  if (eligibleClaims(input.claims, "electorate").length === 0) {
    return {
      ...resultEnvelope,
      status: "no-score" as const,
      reason: "no-eligible-resolved-claims" as const,
      rankingConfidence: 0,
      margin: 0,
      results: [],
    };
  }
  const results = input.candidates.map((candidate) => {
    const personal = scoreSubject({
      subjectId: candidate.candidateId,
      subjectKind: "candidate",
      claims: input.claims,
      relationships: input.relationships,
      lane: "electorate",
      config,
    });
    if (!personal) {
      throw new Error(
        "Electorate ranking requires at least one eligible claim",
      );
    }

    const cohesion = candidate.partyId
      ? assessPartyCohesion(
          candidate.partyId,
          input.cohesionSignals ?? [],
          config,
        )
      : null;
    const officialPartyBase = candidate.partyId
      ? scoreSubject({
          subjectId: candidate.partyId,
          subjectKind: "official-party",
          claims: input.claims,
          relationships: input.relationships,
          lane: "electorate",
          config,
        })
      : null;
    const officialParty =
      officialPartyBase && cohesion
        ? withCohesionConfidence(officialPartyBase, cohesion)
        : officialPartyBase;
    const combined = combineScores(personal, officialParty, config);

    return {
      subjectId: candidate.candidateId,
      partyId: candidate.partyId ?? null,
      personal,
      officialParty,
      combined,
      cohesion,
      status: combined.status,
    };
  });

  results.sort(
    (left, right) =>
      right.combined.rawScore - left.combined.rawScore ||
      right.combined.coverage - left.combined.coverage ||
      left.subjectId.localeCompare(right.subjectId),
  );
  const metrics = rankingMetrics(
    results.map((result) => result.combined),
    config,
  );

  return {
    ...resultEnvelope,
    status: "scored" as const,
    reason: null,
    ...metrics,
    results,
  };
}

export function rankPartyVote(input: {
  partyIds: readonly string[];
  claims: readonly ScoringClaim[];
  relationships: readonly EvidenceRelationship[];
  cohesionSignals?: readonly CohesionSignal[];
  profileVersion: string;
  corpusRevision: string;
  config?: AlignmentScoringConfig;
}) {
  const config = input.config ?? DEFAULT_ALIGNMENT_SCORING_CONFIG;
  const resultEnvelope = envelope({
    lane: "party",
    profileVersion: input.profileVersion,
    corpusRevision: input.corpusRevision,
    claims: input.claims,
    relationships: input.relationships,
    cohesionSignals: input.cohesionSignals ?? [],
    subjectIds: input.partyIds,
    config,
  });
  if (eligibleClaims(input.claims, "party").length === 0) {
    return {
      ...resultEnvelope,
      status: "no-score" as const,
      reason: "no-eligible-resolved-claims" as const,
      rankingConfidence: 0,
      margin: 0,
      results: [],
    };
  }
  const results = input.partyIds.map((subjectId) => {
    const cohesion = assessPartyCohesion(
      subjectId,
      input.cohesionSignals ?? [],
      config,
    );
    const base = scoreSubject({
      subjectId,
      subjectKind: "official-party",
      claims: input.claims,
      relationships: input.relationships,
      lane: "party",
      config,
    });
    if (!base)
      throw new Error("Party ranking requires at least one eligible claim");

    return {
      ...withCohesionConfidence(base, cohesion),
      subjectId,
      cohesion,
    };
  });

  results.sort(
    (left, right) =>
      right.rawScore - left.rawScore ||
      right.coverage - left.coverage ||
      left.subjectId.localeCompare(right.subjectId),
  );
  const metrics = rankingMetrics(results, config);

  return {
    ...resultEnvelope,
    status: "scored" as const,
    reason: null,
    ...metrics,
    results,
  };
}
