import { describe, expect, it } from "vitest";
import { MOCK_RESPONSES } from "@/lib/server/ai/__mocks__/responses";
import { MockChatModel, MockEmbeddings } from "@/lib/server/ai/mock-models";
import {
  parseComponentSpec,
  parseQuestionResponse,
} from "@/types/components.zod";

describe("MockChatModel.invoke", () => {
  it("returns the COMPONENT_SELECTOR fixture when given the selector prompt", async () => {
    const model = new MockChatModel();
    const reply = await model.invoke([
      { role: "system", content: "system" },
      {
        role: "user",
        content:
          "Available component types and their EXACT data structures: ...",
      },
    ]);
    const { ok, spec } = parseComponentSpec(reply.content as string);
    expect(ok).toBe(true);
    expect(spec.type).toBe("priority");
  });

  it("returns the FOLLOWUP_QUESTION fixture for follow-up prompts", async () => {
    const model = new MockChatModel();
    const reply = await model.invoke([
      {
        role: "user",
        content: "Generate a thoughtful follow-up question for the user.",
      },
    ]);
    const parsed = parseQuestionResponse(reply.content as string);
    expect(parsed?.question).toMatch(/more about/);
  });

  it("returns NEXT_QUESTION fixture for next-question prompts", async () => {
    const model = new MockChatModel();
    const reply = await model.invoke([
      { role: "user", content: "Generate the most valuable next question." },
    ]);
    const parsed = parseQuestionResponse(reply.content as string);
    expect(parsed?.question).toBeTruthy();
  });

  it("returns the EXPLAIN_MATCH fixture for match-explanation prompts", async () => {
    const model = new MockChatModel();
    const reply = await model.invoke([
      {
        role: "user",
        content: "Provide a clear, balanced explanation of this match.",
      },
    ]);
    expect(reply.content).toContain("Mock explanation");
  });

  it("falls back to a generic chat reply for unknown prompts", async () => {
    const model = new MockChatModel();
    const reply = await model.invoke([
      { role: "user", content: "hello there" },
    ]);
    expect(typeof reply.content).toBe("string");
    expect((reply.content as string).length).toBeGreaterThan(0);
  });
});

describe("pickMockResponse", () => {
  it("exposes all expected fixtures", () => {
    expect(MOCK_RESPONSES.COMPONENT_SELECTOR).toBeDefined();
    expect(MOCK_RESPONSES.NEXT_QUESTION_GENERAL).toBeDefined();
    expect(MOCK_RESPONSES.FOLLOWUP_QUESTION).toBeDefined();
    expect(MOCK_RESPONSES.EXPLAIN_MATCH).toBeDefined();
    expect(MOCK_RESPONSES.SUMMARIZE_PREFERENCES).toBeDefined();
  });

  it("every JSON fixture parses cleanly", () => {
    for (const [key, value] of Object.entries(MOCK_RESPONSES)) {
      if (key === "EXPLAIN_MATCH" || key === "SUMMARIZE_PREFERENCES") continue;
      expect(() => JSON.parse(value), `fixture ${key}`).not.toThrow();
    }
  });

  it("the COMPONENT_SELECTOR fixture validates against the Zod schema", () => {
    const { ok } = parseComponentSpec(MOCK_RESPONSES.COMPONENT_SELECTOR);
    expect(ok).toBe(true);
  });
});

describe("MockEmbeddings", () => {
  it("returns deterministic vectors of fixed dimension", async () => {
    const e = new MockEmbeddings();
    const v1 = await e.embedQuery("hello");
    const v2 = await e.embedQuery("hello");
    expect(v1).toEqual(v2);
    expect(v1).toHaveLength(e.dimensions);
  });

  it("returns different vectors for different inputs", async () => {
    const e = new MockEmbeddings();
    const v1 = await e.embedQuery("housing policy");
    const v2 = await e.embedQuery("completely unrelated");
    expect(v1).not.toEqual(v2);
  });

  it("embeds a batch of documents", async () => {
    const e = new MockEmbeddings();
    const vs = await e.embedDocuments(["a", "b", "c"]);
    expect(vs).toHaveLength(3);
    expect(vs[0]).toHaveLength(e.dimensions);
  });
});
