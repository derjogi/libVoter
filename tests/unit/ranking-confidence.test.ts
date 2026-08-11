import { describe, expect, it } from "vitest";
import { rankingConfidence } from "@/lib/server/ai/ranking-confidence";
import type { CandidateMatch } from "@/types";

function fakeCandidate(score: number): CandidateMatch {
  return {
    candidate: {
      id: String(score),
      candidacyId: String(score),
      personId: `person-${score}`,
      partyId: null,
      name: `c${score}`,
      party: null,
      seat: "Test Seat",
      candidate_statement: null,
      key_positions: null,
      why: null,
      key_skills: null,
      top_issues: null,
      supporting_links: null,
      photo_url: null,
      created_at: new Date(0),
    },
    score,
    reasoning: "",
    pros: [],
    cons: [],
    topMatchingPolicies: [],
    candidateSources: [],
    partySources: [],
    candidateEvidenceStatus: "empty",
    partyEvidenceStatus: "empty",
  };
}

describe("rankingConfidence", () => {
  it("returns 0 when there are no candidates", () => {
    expect(
      rankingConfidence({
        ranked: [],
        coveredTopicCount: 0,
        totalTopicCount: 8,
      }),
    ).toEqual({ score: 0, marginScore: 0, topicScore: 0 });
  });

  it("uses the top score directly when only one candidate is ranked", () => {
    const r = rankingConfidence({
      ranked: [fakeCandidate(70)],
      coveredTopicCount: 0,
      totalTopicCount: 8,
    });
    // margin == 70, score = clamp(70*2, 0, 100) == 100
    expect(r.score).toBe(100);
  });

  it("rises with topic coverage even when the margin is zero", () => {
    const r = rankingConfidence({
      ranked: [fakeCandidate(50), fakeCandidate(50)],
      coveredTopicCount: 4,
      totalTopicCount: 8,
    });
    // margin=0, topicCoverage=0.5, raw=0+25=25
    expect(r.score).toBe(25);
  });

  it("grows with the spread between top and second candidate", () => {
    const small = rankingConfidence({
      ranked: [fakeCandidate(80), fakeCandidate(75)],
      coveredTopicCount: 0,
      totalTopicCount: 8,
    });
    const big = rankingConfidence({
      ranked: [fakeCandidate(80), fakeCandidate(40)],
      coveredTopicCount: 0,
      totalTopicCount: 8,
    });
    expect(big.score).toBeGreaterThan(small.score);
  });

  it("caps at 100", () => {
    const r = rankingConfidence({
      ranked: [fakeCandidate(95), fakeCandidate(0)],
      coveredTopicCount: 8,
      totalTopicCount: 8,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.topicScore).toBe(100);
  });

  it("handles a totalTopicCount of zero without dividing", () => {
    const r = rankingConfidence({
      ranked: [fakeCandidate(60), fakeCandidate(40)],
      coveredTopicCount: 0,
      totalTopicCount: 0,
    });
    expect(r.score).toBe(40); // margin=20 → 40
    expect(r.topicScore).toBe(0);
  });
});
