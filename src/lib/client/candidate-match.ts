import type { Candidate, CandidateMatch, PartyMatch, PartySummary } from "@/types";

/**
 * Pull up to three display policies from a candidate's structured data, used
 * for the unranked Phase-1 cards (no LLM involved). Prefers explicit
 * `key_positions`, falls back to comma-separated `top_issues`.
 */
function extractTopPolicies(candidate: Candidate): string[] {
  const policies: string[] = [];

  if (candidate.key_positions && typeof candidate.key_positions === "object") {
    policies.push(...Object.keys(candidate.key_positions));
  }

  if (candidate.top_issues && policies.length < 3) {
    policies.push(
      ...candidate.top_issues
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  return policies.slice(0, 3);
}

/**
 * Phase 1 (spec 009): show the electorate's candidates in the right panel
 * immediately on seat selection, before any ranking exists. Score is a
 * neutral 0 — the panel renders these as "building confidence" until later
 * phases compute real match scores.
 */
export function toUnrankedMatch(candidate: Candidate): CandidateMatch {
  return {
    candidate,
    score: 0,
    reasoning: "",
    pros: [],
    cons: [],
    topMatchingPolicies: extractTopPolicies(candidate),
    sources: [],
  };
}

export function toUnrankedMatches(candidates: Candidate[]): CandidateMatch[] {
  return candidates.map(toUnrankedMatch);
}

/**
 * Spec 019: show the active election's parties in the party-vote lane
 * immediately, before any ranking exists. Neutral score 0 until ranking lands.
 */
export function toUnrankedPartyMatch(party: PartySummary): PartyMatch {
  return {
    party,
    score: 0,
    reasoning: "",
    topMatchingPolicies: [],
    sources: [],
  };
}

export function toUnrankedPartyMatches(parties: PartySummary[]): PartyMatch[] {
  return parties.map(toUnrankedPartyMatch);
}
