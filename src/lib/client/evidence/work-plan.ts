import {
  type ClaimEvidenceRelationship,
  createRelationshipCacheKey,
  type RelationshipCache,
  type RelationshipTuple,
  relationshipTupleSchema,
} from "./relationships";

export interface RelationshipWorkPlan {
  reused: ClaimEvidenceRelationship[];
  pending: RelationshipTuple[];
}

export function planRelationshipWork(
  tuples: RelationshipTuple[],
  cache: RelationshipCache,
): RelationshipWorkPlan {
  const reused: ClaimEvidenceRelationship[] = [];
  const pending: RelationshipTuple[] = [];
  const seen = new Set<string>();

  for (const input of tuples) {
    const tuple = relationshipTupleSchema.parse(input);
    const key = createRelationshipCacheKey(tuple);
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = cache[key];
    if (cached) reused.push(cached);
    else pending.push(tuple);
  }
  return { reused, pending };
}

export function relationshipWorkProgress(plan: RelationshipWorkPlan) {
  const completed = plan.reused.length;
  const pending = plan.pending.length;
  const total = completed + pending;
  return {
    completed,
    pending,
    total,
    ratio: total === 0 ? 1 : completed / total,
  };
}
