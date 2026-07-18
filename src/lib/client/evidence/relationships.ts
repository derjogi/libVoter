import { z } from "zod";
import { SHARED_RELATIONSHIP_CATEGORIES } from "@/lib/evidence/relationship-categories";
import { stableContentId } from "@/lib/evidence/stable-key";

export const RELATIONSHIP_CATEGORIES = SHARED_RELATIONSHIP_CATEGORIES;

export const relationshipTupleSchema = z
  .object({
    claimId: z.string().min(1),
    claimSemanticRevision: z.string().min(1),
    passageId: z.string().min(1),
    passageContentRevision: z.string().min(1),
    classifierVersion: z.string().min(1),
  })
  .strict();

export type RelationshipTuple = z.infer<typeof relationshipTupleSchema>;

export const claimEvidenceRelationshipSchema = relationshipTupleSchema
  .extend({
    cacheKey: z.string().min(1),
    category: z.enum(RELATIONSHIP_CATEGORIES),
    interpretationConfidence: z.number().min(0).max(1),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((relationship, context) => {
    if (relationship.cacheKey !== createRelationshipCacheKey(relationship)) {
      context.addIssue({
        code: "custom",
        message: "cacheKey does not match relationship revisions",
        path: ["cacheKey"],
      });
    }
  });

export type ClaimEvidenceRelationship = z.infer<
  typeof claimEvidenceRelationshipSchema
>;

export function createRelationshipCacheKey(tuple: RelationshipTuple): string {
  const parsed = relationshipTupleSchema.parse({
    claimId: tuple.claimId,
    claimSemanticRevision: tuple.claimSemanticRevision,
    passageId: tuple.passageId,
    passageContentRevision: tuple.passageContentRevision,
    classifierVersion: tuple.classifierVersion,
  });
  return `relationship:${stableContentId(parsed)}`;
}

export function createClaimSemanticRevision(claim: {
  statement: string;
  conditions: string[];
  topicTags?: string[];
}): string {
  // Topic tags are display/planning metadata, not political semantics.
  return `claim-semantic:${stableContentId({
    statement: claim.statement.trim(),
    conditions: claim.conditions.map((condition) => condition.trim()),
  })}`;
}

export type RelationshipCache = Record<string, ClaimEvidenceRelationship>;

export function projectRelationshipCache(
  relationships: ClaimEvidenceRelationship[],
): RelationshipCache {
  return Object.fromEntries(
    relationships.map((relationship) => {
      const parsed = claimEvidenceRelationshipSchema.parse(relationship);
      return [parsed.cacheKey, parsed];
    }),
  );
}
