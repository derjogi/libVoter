// Drive the AIChatHandler through MockChatModel to verify the spec-001 fix:
// processMessage no longer throws ReferenceError, returns a valid ChatResponse,
// and follows the AI_MODE=mock fixtures.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "@/lib/server/ai/chat-handler";

beforeAll(() => {
  // Force mock mode before importing anything that constructs a model.
  process.env.AI_MODE = "mock";
});

function candidate(overrides: {
  id: string;
  candidacyId?: string;
  personId?: string;
  partyId?: string | null;
  name: string;
  party: string | null;
}) {
  return {
    id: overrides.id,
    candidacyId: overrides.candidacyId ?? overrides.id,
    personId: overrides.personId ?? overrides.id,
    partyId: overrides.partyId ?? null,
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

function nextQuestionContext(question: string, answer: string) {
  return {
    latest: { question, answer },
    acceptedClaims: [],
    askedCoverage: [],
    confidence: 0,
  };
}

describe("AIChatHandler.processMessage (mock mode)", () => {
  it("returns a valid ChatResponse without throwing", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.processMessage(
      nextQuestionContext(
        "What matters most to you?",
        "I care about housing affordability.",
      ),
      [],
    );

    expect(result).toBeDefined();
    expect(typeof result.message).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.shouldShowCandidates).toBe("boolean");
    // Mock COMPONENT_SELECTOR fixture is a multiselect.
    expect(result.nextComponent?.type).toBeDefined();
  });

  it("survives a multi-turn conversation", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    await handler.processMessage(
      nextQuestionContext("What matters?", "Housing."),
      [],
    );
    const turn2 = await handler.processMessage(
      nextQuestionContext("Anything else?", "And transport too."),
      [],
    );

    expect(turn2.message).toBeDefined();
    expect(turn2.confidence).toBeGreaterThanOrEqual(0);
  });

  it("uses evidence retrieval when ranking available candidates", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.rankResponses(
      [
        {
          id: "r1",
          questionId: "priorities",
          componentType: "chat",
          value: "Climate action and affordable housing",
          timestamp: new Date(),
        },
      ],
      [
        candidate({
          id: "candidacy-green",
          candidacyId: "candidacy-green",
          personId: "person-green",
          partyId: "nz-2026-party-green",
          name: "Greta Green",
          party: "Green",
        }),
      ],
    );

    expect(result.candidateMatches).toHaveLength(1);
    const [match] = result.candidateMatches ?? [];
    expect(match.candidate).toMatchObject({
      id: "candidacy-green",
      candidacyId: "candidacy-green",
      personId: "person-green",
      partyId: "nz-2026-party-green",
    });
    expect(match.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Greta Green — candidate statement" }),
        expect.objectContaining({
          title: "Green — party platform (Wikipedia)",
          url: expect.stringContaining("wikipedia.org"),
        }),
      ]),
    );
    expect(match.reasoning).toContain("Evidence consulted");
    expect(match.score).toBeGreaterThan(0);
  });

  it("retries schema-valid but incomplete candidate rankings", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();
    let calls = 0;

    (handler as unknown as { chatModel: unknown }).chatModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          calls++;
          if (calls === 1) {
            return {
              rankings: [
                { id: "1", score: 82, reasoning: "Only returned the winner" },
              ],
            };
          }
          return {
            rankings: [
              { id: "1", score: 82, reasoning: "Strong climate match" },
              { id: "2", score: 43, reasoning: "Some housing overlap" },
            ],
          };
        },
      }),
    };

    const result = await handler.rankResponses(
      [
        {
          id: "r1",
          questionId: "priorities",
          componentType: "chat",
          value: "Climate action and affordable housing",
          timestamp: new Date(),
        },
      ],
      [
        candidate({ id: "1", name: "Greta Green", party: "Green" }),
        candidate({ id: "2", name: "Laura Labour", party: "Labour" }),
      ],
    );

    expect(calls).toBe(2);
    expect(result.candidateMatches).toHaveLength(2);
    expect(
      result.candidateMatches.map((m) => [m.candidate.id, m.score]),
    ).toEqual([
      ["1", 82],
      ["2", 43],
    ]);
  });

  it("does not include raw provider errors in retry logs", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();
    const providerSecret = "raw-provider-payload-must-not-be-logged";
    let calls = 0;
    (handler as unknown as { chatModel: unknown }).chatModel = {
      withStructuredOutput: () => ({
        invoke: async () => {
          calls++;
          if (calls === 1) throw new Error(providerSecret);
          return { rankings: [] };
        },
      }),
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await (
      handler as unknown as {
        generateRanking: (
          messages: [],
          expectedIds: string[],
        ) => Promise<unknown>;
      }
    ).generateRanking([], []);

    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(providerSecret);
    errorLog.mockRestore();
  });
});

describe("mapWithConcurrency", () => {
  it("limits in-flight async work", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return n * 2;
      },
    );

    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
