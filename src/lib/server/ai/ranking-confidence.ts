// Server-only: derive a single 0-100 confidence number from the *spread* of
// the current candidate ranking and the proportion of key topics covered.
//
// Replaces the older heuristic in ConfidenceCalculator that only counted
// interactions / response length and never reflected actual ranking quality.
import type { CandidateMatch } from '@/types';

export interface RankingConfidenceInput {
  /** Candidates as currently ranked (highest score first). */
  ranked: CandidateMatch[];
  /** Number of distinct key topics the user has touched on so far. */
  coveredTopicCount: number;
  /** Total number of key topics for this election (from electionConfig). */
  totalTopicCount: number;
}

export interface RankingConfidenceResult {
  /** 0-100, suitable for display. */
  score: number;
  /** Spread component (margin between top two candidates), 0-100. */
  marginScore: number;
  /** Topic coverage component, 0-100. */
  topicScore: number;
}

/**
 * Margin-based confidence:
 *   score = clamp(margin * 2 + topicCoverage * 50, 0, 100)
 *
 * - margin = score(top) − score(second), in [0, 100]
 * - topicCoverage = covered / total, in [0, 1]
 *
 * If there's only one candidate, margin=top score (we're already as confident
 * as that score lets us be). If there are no candidates, score=0.
 */
export function rankingConfidence(input: RankingConfidenceInput): RankingConfidenceResult {
  const { ranked, coveredTopicCount, totalTopicCount } = input;

  if (ranked.length === 0) {
    return { score: 0, marginScore: 0, topicScore: 0 };
  }

  const top = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const margin = ranked.length === 1 ? top : Math.max(0, top - second);

  const topicCoverage =
    totalTopicCount > 0 ? Math.min(1, coveredTopicCount / totalTopicCount) : 0;

  const raw = margin * 2 + topicCoverage * 50;
  const score = Math.round(clamp(raw, 0, 100));

  return {
    score,
    marginScore: Math.round(clamp(margin, 0, 100)),
    topicScore: Math.round(topicCoverage * 100),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
