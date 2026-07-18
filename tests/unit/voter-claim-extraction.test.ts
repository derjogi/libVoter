import { describe, expect, it, vi } from "vitest";
import {
  buildClaimExtractionPrompt,
  claimExtractionInputSchema,
  extractClaimsWithModel,
  projectPriorClaims,
} from "@/lib/server/voter-claims/extraction";

const priorClaim = {
  claimId: "00000000-0000-4000-8000-000000000001",
  revisionId: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  statement: "Increase regional rail investment",
  conditions: [],
  topicTags: ["transport"],
  proposedImportance: 0.7,
  confirmedImportance: null,
  status: "active" as const,
  sourceResponseId: "response-secret",
  createdAt: "2026-07-18T10:00:00.000Z",
};

describe("stateless voter claim extraction", () => {
  it("rejects oversized or malformed public action input", () => {
    expect(
      claimExtractionInputSchema.safeParse({
        responseId: "response-1",
        baseProfileVersion: 0,
        question: "q".repeat(4_001),
        answer: "answer",
        activeClaims: [],
      }).success,
    ).toBe(false);
    expect(
      claimExtractionInputSchema.safeParse({
        responseId: "response-1",
        baseProfileVersion: 0,
        question: "question",
        answer: "answer",
        activeClaims: Array.from({ length: 101 }, () => priorClaim),
      }).success,
    ).toBe(false);
  });

  it("prompts with exact Q/A and compact aliased claims without trusted ids", () => {
    const claims = projectPriorClaims([priorClaim]);
    const prompt = buildClaimExtractionPrompt({
      question: "Should rail funding rise — even if rates increase?",
      answer: "Yes, but only with published cost controls.",
      priorClaims: claims,
    });

    expect(claims).toEqual([
      {
        alias: "claim-1",
        statement: priorClaim.statement,
        conditions: [],
        topicTags: ["transport"],
        importance: 0.7,
      },
    ]);
    expect(prompt).toContain(
      "Should rail funding rise — even if rates increase?",
    );
    expect(prompt).toContain("Yes, but only with published cost controls.");
    expect(prompt).toContain("claim-1");
    expect(prompt).not.toContain(priorClaim.claimId);
    expect(prompt).not.toContain(priorClaim.revisionId);
    expect(prompt).not.toContain(priorClaim.sourceResponseId);
  });

  it("maps aliases to trusted ids after validating model operations", async () => {
    const invoke = vi.fn().mockResolvedValue({
      operations: [
        {
          kind: "revise",
          targetRef: "claim-1",
          content: {
            statement: "Increase rail investment with cost controls",
            conditions: ["Publish cost controls"],
            topicTags: ["transport", "public spending"],
            proposedImportance: 0.8,
          },
        },
      ],
    });
    const result = await extractClaimsWithModel(
      {
        responseId: "response-2",
        baseProfileVersion: 4,
        question: "What controls?",
        answer: "Publish them.",
        activeClaims: [priorClaim],
      },
      { withStructuredOutput: () => ({ invoke }) },
    );

    expect(result.operations[0]).toMatchObject({
      kind: "revise",
      targetClaimId: priorClaim.claimId,
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("returns deterministic operations in mock mode without invoking a model", async () => {
    const model = { withStructuredOutput: vi.fn() };
    const result = await extractClaimsWithModel(
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        question: "What matters most?",
        answer: "Affordable housing.",
        activeClaims: [],
        mock: true,
      },
      model,
    );

    expect(model.withStructuredOutput).not.toHaveBeenCalled();
    expect(result).toEqual({
      responseId: "response-1",
      baseProfileVersion: 0,
      operations: [
        {
          kind: "create",
          content: {
            statement: "Mock preference from the latest answer",
            conditions: [],
            topicTags: ["mock-topic"],
            proposedImportance: 0.5,
          },
        },
      ],
    });
  });
});
