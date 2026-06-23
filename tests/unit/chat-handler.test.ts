// Drive the AIChatHandler through MockChatModel to verify the spec-001 fix:
// processMessage no longer throws ReferenceError, returns a valid ChatResponse,
// and follows the AI_MODE=mock fixtures.
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // Force mock mode before importing anything that constructs a model.
  process.env.AI_MODE = "mock";
});

describe("AIChatHandler.processMessage (mock mode)", () => {
  it("returns a valid ChatResponse without throwing", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.processMessage(
      "I care about housing affordability.",
      [],
      [],
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

    const turn1 = await handler.processMessage("Housing.", [], [], []);
    const turn2 = await handler.processMessage(
      "And transport too.",
      [
        { id: "1", role: "user", content: "Housing.", timestamp: new Date() },
        {
          id: "2",
          role: "assistant",
          content: turn1.message,
          timestamp: new Date(),
        },
      ],
      [
        {
          id: "r1",
          questionId: "q1",
          componentType: "chat",
          value: "Housing.",
          timestamp: new Date(),
        },
      ],
      [],
    );

    expect(turn2.message).toBeDefined();
    expect(turn2.confidence).toBeGreaterThanOrEqual(0);
  });

  it("uses evidence retrieval when ranking available candidates", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.processMessage(
      "I care about climate action and affordable housing.",
      [],
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
        {
          id: 1,
          name: "Greta Green",
          party: "Green",
          ward: "Wellington Central",
          candidate_statement: null,
          key_positions: null,
          why: null,
          key_skills: null,
          top_issues: null,
          supporting_links: null,
          photo_url: null,
          created_at: new Date(),
        },
      ],
    );

    expect(result.candidateMatches).toHaveLength(1);
    const [match] = result.candidateMatches ?? [];
    expect(match.sources).toEqual([
      expect.objectContaining({
        title: "Green — party platform (Wikipedia)",
        url: expect.stringContaining("wikipedia.org"),
      }),
    ]);
    expect(match.reasoning).toContain("Evidence consulted");
    expect(match.score).toBeGreaterThan(0);
  });
});
