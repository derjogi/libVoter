import {
  type ClaimEvidenceRelationship,
  claimEvidenceRelationshipSchema,
  createRelationshipCacheKey,
  type RelationshipTuple,
} from "./relationships";

export const MOCK_RELATIONSHIP_CLASSIFIER_VERSION = "mock-v1";

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (term) => term.length > 3 && !["support", "oppose"].includes(term),
      ),
  );
}

export function classifyRelationshipMock(
  input: RelationshipTuple & { claimText: string; passageText: string },
): ClaimEvidenceRelationship {
  const claimTerms = terms(input.claimText);
  const passageTerms = terms(input.passageText);
  const overlap = [...claimTerms].filter((term) => passageTerms.has(term));
  const passage = input.passageText.toLowerCase();
  const topical = overlap.length > 0;
  const category = !topical
    ? "unclear"
    : /\b(oppose|opposes|opposed|reject|rejects|against)\b/.test(passage)
      ? "opposed"
      : /\b(support|supports|supported|fund|funds|back|backs)\b/.test(passage)
        ? "aligned"
        : "unclear";
  const reason = !topical
    ? "The passage does not share enough specific terms with the claim."
    : category === "aligned"
      ? "The passage explicitly supports the claim's subject."
      : category === "opposed"
        ? "The passage explicitly opposes the claim's subject."
        : "The passage is topical but does not establish a direction.";
  const tuple = {
    claimId: input.claimId,
    claimSemanticRevision: input.claimSemanticRevision,
    passageId: input.passageId,
    passageContentRevision: input.passageContentRevision,
    classifierVersion: input.classifierVersion,
  };
  return claimEvidenceRelationshipSchema.parse({
    ...tuple,
    cacheKey: createRelationshipCacheKey(tuple),
    category,
    interpretationConfidence: topical ? 0.9 : 0.35,
    reason,
  });
}
