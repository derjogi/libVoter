import type {
  CohesionSignal,
  EvidenceRelationship,
  ScoringClaim,
} from "@/lib/scoring/alignment";

export const scoringVersions = {
  profileVersion: "profile-golden-v1",
  corpusRevision: "corpus-golden-v1",
} as const;

export const claims = {
  support: {
    id: "claim-support",
    revision: "2",
    statement: "Keep fares low",
    topicTags: ["transport"],
    confirmedImportance: 1,
    voteLane: "both",
    status: "active",
    resolution: "resolved",
  },
  tradeOff: {
    id: "claim-trade-off",
    revision: "1",
    statement: "Build rail even if rates rise modestly",
    topicTags: ["transport", "rates"],
    confirmedImportance: 0.25,
    voteLane: "electorate",
    status: "active",
    resolution: "resolved",
  },
  correctedOld: {
    id: "claim-correction-old",
    revision: "1",
    statement: "Do not build rail",
    topicTags: ["transport"],
    confirmedImportance: 1,
    voteLane: "both",
    status: "superseded",
    resolution: "resolved",
  },
  corrected: {
    id: "claim-correction",
    revision: "2",
    statement: "Build rail (correction: my prior answer was mistaken)",
    topicTags: ["transport"],
    confirmedImportance: 1,
    voteLane: "both",
    status: "active",
    resolution: "resolved",
  },
  negated: {
    id: "claim-negation",
    revision: "1",
    statement: "I do not support motorway expansion",
    topicTags: ["transport"],
    confirmedImportance: 0.75,
    voteLane: "electorate",
    status: "active",
    resolution: "resolved",
  },
  unresolved: {
    id: "claim-unresolved",
    revision: "1",
    statement: "I might support this depending on the details",
    topicTags: ["housing"],
    confirmedImportance: 1,
    voteLane: "both",
    status: "active",
    resolution: "unresolved",
  },
} as const satisfies Record<string, ScoringClaim>;

export function relationship(
  id: string,
  claimId: string,
  subjectId: string,
  category:
    | "aligned"
    | "partially-aligned"
    | "unclear"
    | "partially-opposed"
    | "opposed",
  overrides: Partial<EvidenceRelationship> = {},
): EvidenceRelationship {
  return {
    id,
    claimId,
    subjectId,
    subjectKind: "candidate",
    category,
    interpretationConfidence: 1,
    sourceQuality: 1,
    recencyWeight: 1,
    independenceKey: id,
    evidenceId: `evidence-${id}`,
    ...overrides,
  };
}

export const categoricalRelationships = [
  relationship("support", claims.support.id, "candidate-support", "aligned"),
  relationship("opposition", claims.support.id, "candidate-oppose", "opposed"),
  relationship("unclear", claims.support.id, "candidate-unclear", "unclear"),
];

export const duplicateRelationships = [
  relationship(
    "original",
    claims.support.id,
    "candidate-duplicate",
    "aligned",
    {
      independenceKey: "same-press-release",
    },
  ),
  relationship("copy-1", claims.support.id, "candidate-duplicate", "aligned", {
    independenceKey: "same-press-release",
    interpretationConfidence: 0.8,
  }),
  relationship("copy-2", claims.support.id, "candidate-duplicate", "aligned", {
    independenceKey: "same-press-release",
    interpretationConfidence: 0.6,
  }),
];

export const laneRelationships = [
  relationship(
    "candidate-support",
    claims.support.id,
    "candidate-a",
    "aligned",
  ),
  relationship("party-opposition", claims.support.id, "party-a", "opposed", {
    subjectKind: "official-party",
  }),
  relationship(
    "independent-support",
    claims.support.id,
    "candidate-independent",
    "aligned",
  ),
];

export const memberDisagreement = [
  {
    id: "cohesion-disagreement",
    partyId: "party-a",
    memberId: "member-a",
    category: "opposed",
    interpretationConfidence: 1,
    sourceQuality: 1,
    recencyWeight: 1,
    independenceKey: "member-speech-a",
    evidenceId: "evidence-member-disagreement",
  },
] satisfies CohesionSignal[];
