// Spec 019: MMP party-vote matching panel.
// Verifies the party-vote lane data shape and that adding party matches never
// changes the electorate-candidate lane. Runs under AI_MODE=mock.
import { beforeAll, describe, expect, it } from "vitest";
import type { PartySummary, UserResponse } from "@/types";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

function candidate(overrides: {
  id: string;
  name: string;
  party: string | null;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    party: overrides.party,
    seat: "Wellington Central",
    candidate_statement: null,
    key_positions: null,
    why: null,
    key_skills: null,
    top_issues: null,
    supporting_links: null,
    photo_url: null,
    created_at: new Date(),
  };
}

const responses: UserResponse[] = [
  {
    id: "r1",
    questionId: "priorities",
    componentType: "chat",
    value: "Climate action and affordable housing",
    timestamp: new Date(),
  },
];

describe("getPartiesForCurrentElection (spec 019)", () => {
  it("returns all parties for the active election's party vote", async () => {
    const { getPartiesForCurrentElection } = await import(
      "@/lib/actions/database"
    );
    const result = await getPartiesForCurrentElection();

    expect(result.success).toBe(true);
    // NZ 2026 seeds 13 canonical parties + a few off-config ones (spec 010).
    expect(result.data?.length).toBeGreaterThanOrEqual(13);
    for (const party of result.data ?? []) {
      expect(party.id).toMatch(/^nz-2026-party-/);
      expect(typeof party.name).toBe("string");
      expect(party.name.length).toBeGreaterThan(0);
    }
  });
});

describe("AIChatHandler.rankResponses party lane (spec 019)", () => {
  const parties: PartySummary[] = [
    { id: "nz-2026-party-green", name: "Green", leader: null },
    { id: "nz-2026-party-labour", name: "Labour", leader: null },
    { id: "nz-2026-party-national", name: "National", leader: null },
  ];

  it("ranks parties as a separate list without touching the candidate list", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();
    const candidates = [
      candidate({ id: "1", name: "Greta Green", party: "Green" }),
      candidate({ id: "2", name: "Laura Labour", party: "Labour" }),
    ];

    const withoutParties = await handler.rankResponses(responses, candidates);
    const withParties = await handler.rankResponses(
      responses,
      candidates,
      parties,
    );

    // Candidate lane is unchanged by the presence of the party lane.
    expect(withoutParties.partyMatches).toEqual([]);
    expect(
      withParties.candidateMatches.map((m) => [m.candidate.id, m.score]),
    ).toEqual(
      withoutParties.candidateMatches.map((m) => [m.candidate.id, m.score]),
    );

    // Party lane returns one entry per party, sorted by score (desc).
    expect(withParties.partyMatches).toHaveLength(parties.length);
    const ids = withParties.partyMatches.map((p) => p.party.id).sort();
    expect(ids).toEqual(parties.map((p) => p.id).sort());
    const scores = withParties.partyMatches.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Party scores and candidate scores are not conflated (separate fields).
    for (const p of withParties.partyMatches) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
  });

  it("returns an empty party list when no parties are supplied (non-MMP)", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.rankResponses(responses, [
      candidate({ id: "1", name: "Greta Green", party: "Green" }),
    ]);

    expect(result.partyMatches).toEqual([]);
    expect(result.candidateMatches.length).toBe(1);
  });

  it("returns both lists deterministically in mock mode", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const a = await handler.rankResponses(
      responses,
      [candidate({ id: "1", name: "Greta Green", party: "Green" })],
      parties,
    );
    const b = await handler.rankResponses(
      responses,
      [candidate({ id: "1", name: "Greta Green", party: "Green" })],
      parties,
    );

    expect(a.partyMatches.map((p) => [p.party.id, p.score])).toEqual(
      b.partyMatches.map((p) => [p.party.id, p.score]),
    );
    expect(a.candidateMatches.length).toBeGreaterThan(0);
    expect(a.partyMatches.length).toBe(parties.length);
  });
});
