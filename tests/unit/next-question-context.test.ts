import { describe, expect, it } from "vitest";
import {
  buildNextQuestionMessages,
  nextQuestionContextSchema,
} from "@/lib/server/voter-claims/next-question-context";

describe("compact next-question context", () => {
  it("rejects oversized context before constructing a provider prompt", () => {
    expect(
      nextQuestionContextSchema.safeParse({
        latest: { question: "question", answer: "a".repeat(10_001) },
        acceptedClaims: [],
        askedCoverage: [],
        confidence: 0,
      }).success,
    ).toBe(false);
  });

  it("contains the latest exact Q/A, accepted aliased claims, and asked coverage only", () => {
    const messages = buildNextQuestionMessages({
      latest: {
        question: "Which trade-off matters?",
        answer: "Protect renters.",
      },
      acceptedClaims: [
        {
          alias: "claim-1",
          statement: "Increase tenant protections",
          conditions: [],
          topicTags: ["housing"],
          importance: 0.8,
        },
      ],
      askedCoverage: [
        { question: "What is your housing priority?", topicTags: ["housing"] },
      ],
      confidence: 30,
    });
    const text = messages.map((message) => String(message.content)).join("\n");

    expect(text).toContain("Which trade-off matters?");
    expect(text).toContain("Protect renters.");
    expect(text).toContain("claim-1");
    expect(text).toContain("What is your housing priority?");
    expect(text).not.toContain("sessionId");
    expect(text).not.toContain("sourceResponseId");
  });
});
