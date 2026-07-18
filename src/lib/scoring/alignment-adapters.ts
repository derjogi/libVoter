import type { ClaimEvidenceRelationship } from "@/lib/client/evidence/relationships";
import type { PublishedPassage } from "@/lib/evidence/corpus-publication";
import type { VoterClaimRevision } from "@/types/voter-claims.zod";
import type { EvidenceRelationship, ScoringClaim, VoteLane } from "./alignment";

export interface ElectorateCandidateEvidenceIdentity {
  subjectId: string;
  candidacyId: string;
  personId: string;
}

export interface PassageSignal {
  sourceQuality: number;
  recencyWeight: number;
}

export function adaptClaimRevisionToScoringClaim(
  claim: VoterClaimRevision,
  options: { voteLane: VoteLane },
): ScoringClaim {
  return {
    id: claim.claimId,
    revision: String(claim.revision),
    statement: claim.statement,
    topicTags: claim.topicTags,
    confirmedImportance: claim.confirmedImportance ?? 0,
    voteLane: options.voteLane,
    status: claim.status,
    resolution: claim.confirmedImportance === null ? "unresolved" : "resolved",
  };
}

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
}

export function adaptRelationshipsToScoringEvidence(input: {
  relationships: readonly ClaimEvidenceRelationship[];
  passages: readonly PublishedPassage[];
  electorateCandidates: readonly ElectorateCandidateEvidenceIdentity[];
  passageSignals: Readonly<Record<string, PassageSignal>>;
}): EvidenceRelationship[] {
  const passagesById = new Map(
    input.passages.map((passage) => [passage.id, passage]),
  );
  const byCandidacy = new Map(
    input.electorateCandidates.map((candidate) => [
      candidate.candidacyId,
      candidate,
    ]),
  );
  const byPerson = new Map<string, ElectorateCandidateEvidenceIdentity[]>();
  for (const candidate of input.electorateCandidates) {
    byPerson.set(candidate.personId, [
      ...(byPerson.get(candidate.personId) ?? []),
      candidate,
    ]);
  }

  return input.relationships.flatMap((relationship) => {
    const passage = passagesById.get(relationship.passageId);
    if (!passage) {
      throw new Error(`Missing canonical passage ${relationship.passageId}`);
    }
    if (relationship.passageContentRevision !== passage.contentRevision) {
      throw new Error(
        `Relationship revision does not match passage ${relationship.passageId}`,
      );
    }
    const signal = input.passageSignals[passage.id];
    if (!signal) {
      throw new Error(`Missing scoring signal for passage ${passage.id}`);
    }
    assertUnitInterval(signal.sourceQuality, "sourceQuality");
    assertUnitInterval(signal.recencyWeight, "recencyWeight");

    const subjects:
      | Array<{ subjectId: string; subjectKind: "candidate" }>
      | Array<{ subjectId: string; subjectKind: "official-party" }> =
      passage.subjectType === "candidacy"
        ? (() => {
            const candidate = byCandidacy.get(passage.candidacyId as string);
            return candidate
              ? [
                  {
                    subjectId: candidate.subjectId,
                    subjectKind: "candidate" as const,
                  },
                ]
              : [];
          })()
        : passage.subjectType === "person"
          ? (byPerson.get(passage.personId as string) ?? []).map(
              (candidate) => ({
                subjectId: candidate.subjectId,
                subjectKind: "candidate" as const,
              }),
            )
          : [
              {
                subjectId: passage.officialPartyId as string,
                subjectKind: "official-party" as const,
              },
            ];

    return subjects.map((subject, index) => ({
      id:
        subjects.length === 1
          ? relationship.cacheKey
          : `${relationship.cacheKey}:${index}`,
      claimId: relationship.claimId,
      ...subject,
      category: relationship.category,
      interpretationConfidence: relationship.interpretationConfidence,
      sourceQuality: signal.sourceQuality,
      recencyWeight: signal.recencyWeight,
      independenceKey: passage.independenceKey,
      evidenceId: passage.id,
    }));
  });
}
