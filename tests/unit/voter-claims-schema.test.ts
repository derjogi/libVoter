import { describe, expect, it } from "vitest";
import { extractedClaimOperationSchema } from "@/types/voter-claims.zod";

const content = {
  statement: "Invest more in regional rail",
  conditions: [],
  topicTags: ["transport", "regional development"],
  proposedImportance: 0.6,
};

describe("extracted claim operation schema", () => {
  it.each(["claimId", "revisionId", "sourceResponseId", "status", "createdAt"])(
    "rejects AI-controlled trusted field %s",
    (field) => {
      const result = extractedClaimOperationSchema.safeParse({
        kind: "create",
        content,
        [field]: "untrusted",
      });

      expect(result.success).toBe(false);
    },
  );

  it("allows only an opaque prompt-local reference when revising a claim", () => {
    expect(
      extractedClaimOperationSchema.safeParse({
        kind: "revise",
        targetRef: "claim-2",
        content,
      }).success,
    ).toBe(true);
    expect(
      extractedClaimOperationSchema.safeParse({
        kind: "revise",
        targetClaimId: "00000000-0000-4000-8000-000000000001",
        content,
      }).success,
    ).toBe(false);
  });
});
