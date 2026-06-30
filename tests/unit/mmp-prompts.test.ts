// Spec 020: MMP two-vote conversation and prompt wiring.
// Verifies MMP two-vote language appears only for MMP elections and that the
// chat turn can carry a party/electorate/both vote-lane marker in mock mode.
import { beforeAll, describe, expect, it } from "vitest";
import { AUCKLAND_2025, NZ_2026 } from "@/lib/config/election";
import {
  isTwoVoteElection,
  mmpVotingGuidance,
  voteLaneLabel,
} from "@/lib/server/prompts/mmp-guidance";

beforeAll(() => {
  process.env.AI_MODE = "mock";
});

describe("mmpVotingGuidance (spec 020)", () => {
  it("includes party-vote and electorate-vote language for MMP (NZ 2026)", () => {
    expect(isTwoVoteElection(NZ_2026)).toBe(true);
    const guidance = mmpVotingGuidance(NZ_2026).toLowerCase();
    expect(guidance).toContain("party vote");
    expect(guidance).toContain("electorate vote");
    expect(guidance).toContain("two independent votes");
  });

  it("is empty for non-MMP elections (Auckland 2025)", () => {
    expect(isTwoVoteElection(AUCKLAND_2025)).toBe(false);
    expect(mmpVotingGuidance(AUCKLAND_2025)).toBe("");
  });

  it("labels each vote lane", () => {
    expect(voteLaneLabel("party")).toMatch(/party/i);
    expect(voteLaneLabel("electorate")).toMatch(/electorate/i);
    expect(voteLaneLabel("both")).toMatch(/both/i);
  });
});

describe("PromptManager.buildSystemMessage (spec 020)", () => {
  it("adds MMP two-vote language for MMP elections only", async () => {
    const { PromptManager } = await import(
      "@/lib/server/prompts/prompt-manager"
    );

    const mmp = new PromptManager(NZ_2026).buildSystemMessage().toLowerCase();
    expect(mmp).toContain("party vote");
    expect(mmp).toContain("electorate vote");

    const nonMmp = new PromptManager(AUCKLAND_2025)
      .buildSystemMessage()
      .toLowerCase();
    expect(nonMmp).not.toContain("party vote");
  });
});

describe("AIChatHandler vote-lane marker (spec 020)", () => {
  it("tags the question with a vote lane in mock mode (active MMP election)", async () => {
    const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
    const handler = new AIChatHandler();

    const result = await handler.processMessage(
      "I care about climate and cost of living.",
      [],
      [],
      [],
    );

    // Active election is NZ 2026 (MMP), so the marker is surfaced.
    expect(["party", "electorate", "both"]).toContain(result.voteLane);
  });
});
