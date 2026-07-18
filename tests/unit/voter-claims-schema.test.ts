import { describe, expect, it } from "vitest";
import { createSessionSnapshot } from "@/lib/client/voter-profile/session-reducer";
import {
  extractedClaimOperationSchema,
  sessionSnapshotSchema,
} from "@/types/voter-claims.zod";

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

  it("accepts an uncertain merge signal without trusted identity fields", () => {
    expect(
      extractedClaimOperationSchema.safeParse({
        kind: "uncertain",
        targetRef: "claim-1",
        content,
        reason: "Could be a refinement or a distinct position",
      }).success,
    ).toBe(true);
    expect(
      extractedClaimOperationSchema.safeParse({
        kind: "uncertain",
        targetClaimId: "00000000-0000-4000-8000-000000000001",
        content,
        reason: "Untrusted identity",
      }).success,
    ).toBe(false);
  });
});

describe("session snapshot relational invariants", () => {
  const deps = {
    createId: () => "00000000-0000-4000-8000-000000000023",
    now: () => "2026-07-19T00:00:00.000Z",
  };
  const politicalResponse = {
    id: "response-1",
    question: "What matters?",
    answer: "Housing",
    componentType: "chat" as const,
    submittedAt: "2026-07-19T00:00:01.000Z",
    kind: "political" as const,
  };

  it("rejects duplicate response ids", () => {
    const snapshot = createSessionSnapshot(deps);
    snapshot.responses = [politicalResponse, politicalResponse];

    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("allows skipped seat setup but rejects pending extraction or missing provenance", () => {
    const snapshot = createSessionSnapshot(deps);
    snapshot.responses = [{ ...politicalResponse, kind: "seat-selection" }];
    snapshot.extractions = [
      {
        responseId: politicalResponse.id,
        baseProfileVersion: 0,
        status: "skipped",
      },
    ];

    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(true);
    snapshot.extractions[0].status = "pending";
    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.responses = [];
    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects transcript and claim provenance that reference missing responses", () => {
    const snapshot = createSessionSnapshot(deps);
    snapshot.transcriptSteps = [
      {
        id: "step-1",
        locked: true,
        component: {
          type: "chat",
          data: { prompt: "Question", placeholder: "Answer" },
        },
        responseId: "missing-response",
      },
    ];
    snapshot.claims = [
      {
        claimId: "00000000-0000-4000-8000-000000000024",
        revisionId: "00000000-0000-4000-8000-000000000025",
        revision: 1,
        statement: "Housing matters",
        conditions: [],
        topicTags: ["housing"],
        proposedImportance: 0.5,
        confirmedImportance: null,
        status: "active",
        sourceResponseId: "missing-response",
        createdAt: "2026-07-19T00:00:02.000Z",
      },
    ];

    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
