import { describe, expect, it } from "vitest";
import {
  applyExtractionResult,
  confirmClaimImportance,
  createSessionSnapshot,
  failExtraction,
  recordResponse,
  resetSession,
  retagClaim,
  retryExtraction,
} from "@/lib/client/voter-profile/session-reducer";
import { sessionSnapshotSchema } from "@/types/voter-claims.zod";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];

function dependencies() {
  let index = 0;
  return {
    createId: () =>
      ids[index++] ??
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    now: () => "2026-07-18T10:00:00.000Z",
  };
}

function response(id: string, question: string, answer: string) {
  return {
    id,
    question,
    answer,
    componentType: "chat" as const,
    submittedAt: "2026-07-18T09:59:00.000Z",
    kind: "political" as const,
  };
}

describe("voter session reducer", () => {
  it("records a response once and marks political responses pending extraction", () => {
    const deps = dependencies();
    const initial = createSessionSnapshot(deps);
    const submitted = response(
      "response-1",
      "Should rail investment increase?",
      "Yes, especially regional rail.",
    );

    const once = recordResponse(initial, submitted);
    const twice = recordResponse(once, submitted);

    expect(twice.responses).toEqual([submitted]);
    expect(twice.extractions).toEqual([
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        status: "pending",
      },
    ]);
    expect(sessionSnapshotSchema.safeParse(twice).success).toBe(true);
  });

  it("assigns trusted claim identity and provenance when applying extracted content", () => {
    const deps = dependencies();
    const initial = recordResponse(
      createSessionSnapshot(deps),
      response("response-1", "What matters about rail?", "Low fares."),
    );

    const updated = applyExtractionResult(
      initial,
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Keep public transport fares affordable",
              conditions: [],
              topicTags: ["transport", "cost of living"],
              proposedImportance: 0.7,
            },
          },
        ],
      },
      deps,
    );

    expect(updated.profileVersion).toBe(1);
    expect(updated.claims).toMatchObject([
      {
        claimId: "00000000-0000-4000-8000-000000000002",
        revisionId: "00000000-0000-4000-8000-000000000003",
        revision: 1,
        status: "active",
        sourceResponseId: "response-1",
        statement: "Keep public transport fares affordable",
        topicTags: ["transport", "cost of living"],
      },
    ]);
    expect(updated.extractions[0]?.status).toBe("applied");
  });

  it("preserves the previous revision when a claim is clarified", () => {
    const deps = dependencies();
    const withFirstClaim = applyExtractionResult(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "Housing density?", "Only near train stations."),
      ),
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Allow denser housing near train stations",
              conditions: ["Fund supporting infrastructure"],
              topicTags: ["housing", "transport"],
              proposedImportance: 0.8,
            },
          },
        ],
      },
      deps,
    );
    const claimId = withFirstClaim.claims[0]?.claimId ?? "";
    const withSecondResponse = recordResponse(
      withFirstClaim,
      response(
        "response-2",
        "Which infrastructure matters most?",
        "Public transport capacity, not schools.",
      ),
    );

    const revised = applyExtractionResult(
      withSecondResponse,
      {
        responseId: "response-2",
        baseProfileVersion: 1,
        operations: [
          {
            kind: "revise",
            targetClaimId: claimId,
            content: {
              statement: "Allow denser housing near train stations",
              conditions: ["Fund sufficient public transport capacity"],
              topicTags: ["housing", "transport", "infrastructure"],
              proposedImportance: 0.8,
            },
          },
        ],
      },
      deps,
    );

    expect(revised.claims).toHaveLength(2);
    expect(revised.claims[0]).toMatchObject({
      revision: 1,
      status: "superseded",
    });
    expect(revised.claims[1]).toMatchObject({
      claimId,
      revision: 2,
      status: "active",
      sourceResponseId: "response-2",
      topicTags: ["housing", "transport", "infrastructure"],
    });
  });

  it("does not apply an extraction based on a stale profile version", () => {
    const deps = dependencies();
    const withResponses = recordResponse(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "Question one?", "Answer one"),
      ),
      response("response-2", "Question two?", "Answer two"),
    );
    const afterFirst = applyExtractionResult(
      withResponses,
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [],
      },
      deps,
    );

    const stale = applyExtractionResult(
      afterFirst,
      {
        responseId: "response-2",
        baseProfileVersion: 0,
        operations: [],
      },
      deps,
    );

    expect(stale.profileVersion).toBe(1);
    expect(stale.extractions[1]).toMatchObject({
      responseId: "response-2",
      status: "stale",
    });
  });

  it("queues an out-of-order extraction until earlier responses resolve", () => {
    const deps = dependencies();
    const withResponses = recordResponse(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "Question one?", "Answer one"),
      ),
      response("response-2", "Question two?", "Answer two"),
    );

    const queued = applyExtractionResult(
      withResponses,
      {
        responseId: "response-2",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Second answer claim",
              conditions: [],
              topicTags: ["dynamic topic"],
              proposedImportance: 0.5,
            },
          },
        ],
      },
      deps,
    );

    expect(queued.profileVersion).toBe(0);
    expect(queued.claims).toEqual([]);
    expect(queued.extractions[1]?.status).toBe("queued");
    expect(queued.queuedExtractionResults).toHaveLength(1);

    const drained = applyExtractionResult(
      queued,
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [],
      },
      deps,
    );

    expect(drained.profileVersion).toBe(2);
    expect(drained.claims).toHaveLength(1);
    expect(drained.claims[0]).toMatchObject({
      statement: "Second answer claim",
      sourceResponseId: "response-2",
      status: "active",
    });
    expect(drained.extractions[1]?.status).toBe("applied");
    expect(drained.queuedExtractionResults).toEqual([]);
  });

  it("retags an active claim without creating a semantic revision", () => {
    const deps = dependencies();
    const claimed = applyExtractionResult(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "What matters?", "Reliable buses"),
      ),
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Fund reliable buses",
              conditions: [],
              topicTags: ["transport"],
              proposedImportance: 0.6,
            },
          },
        ],
      },
      deps,
    );
    const active = claimed.claims[0];
    if (!active) throw new Error("missing test claim");

    const retagged = retagClaim(
      claimed,
      active.claimId,
      ["public transport", "accessibility", "public transport"],
      deps,
    );

    expect(retagged.profileVersion).toBe(claimed.profileVersion);
    expect(retagged.claims).toHaveLength(1);
    expect(retagged.claims[0]).toMatchObject({
      revisionId: active.revisionId,
      revision: 1,
      topicTags: ["public transport", "accessibility"],
    });
  });

  it("confirms importance without replacing the claim revision", () => {
    const deps = dependencies();
    const claimed = applyExtractionResult(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "What matters?", "Housing"),
      ),
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Build more homes",
              conditions: [],
              topicTags: ["housing"],
              proposedImportance: 0.5,
            },
          },
        ],
      },
      deps,
    );
    const active = claimed.claims[0];
    if (!active) throw new Error("missing test claim");

    const confirmed = confirmClaimImportance(
      claimed,
      active.claimId,
      0.9,
      deps,
    );

    expect(confirmed.profileVersion).toBe(claimed.profileVersion + 1);
    expect(confirmed.claims).toHaveLength(1);
    expect(confirmed.claims[0]).toMatchObject({
      revisionId: active.revisionId,
      revision: 1,
      confirmedImportance: 0.9,
    });
  });

  it("keeps uncertain merge operations pending without mutating claims", () => {
    const deps = dependencies();
    const pending = applyExtractionResult(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "Has your housing view changed?", "Maybe"),
      ),
      {
        responseId: "response-1",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "uncertain",
            content: {
              statement: "Housing policy may need revision",
              conditions: ["The voter was unsure"],
              topicTags: ["housing"],
              proposedImportance: 0.5,
            },
            targetClaimId: null,
            reason: "Unclear whether this revises an existing position",
          },
        ],
      },
      deps,
    );

    expect(pending.profileVersion).toBe(1);
    expect(pending.claims).toEqual([]);
    expect(pending.pendingClaimOperations).toHaveLength(1);
    expect(pending.pendingClaimOperations[0]).toMatchObject({
      responseId: "response-1",
      reason: "Unclear whether this revises an existing position",
    });
  });

  it("records failures, drains independent queued successors, and supports retry", () => {
    const deps = dependencies();
    const withResponses = recordResponse(
      recordResponse(
        createSessionSnapshot(deps),
        response("response-1", "One?", "One"),
      ),
      response("response-2", "Two?", "Two"),
    );
    const queued = applyExtractionResult(
      withResponses,
      {
        responseId: "response-2",
        baseProfileVersion: 0,
        operations: [
          {
            kind: "create",
            content: {
              statement: "Independent second claim",
              conditions: [],
              topicTags: ["second topic"],
              proposedImportance: 0.5,
            },
          },
        ],
      },
      deps,
    );

    const failed = failExtraction(
      queued,
      "response-1",
      "provider unavailable",
      deps,
    );
    expect(failed.extractions[0]).toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
    expect(failed.extractions[1]?.status).toBe("applied");
    expect(failed.profileVersion).toBe(1);

    const retried = retryExtraction(failed, "response-1", deps);
    expect(retried.extractions[0]).toMatchObject({
      status: "pending",
      baseProfileVersion: 1,
    });
    expect(retried.extractions[0]).not.toHaveProperty("error");
  });

  it("reset returns a fresh empty snapshot", () => {
    const deps = dependencies();
    const used = recordResponse(
      createSessionSnapshot(deps),
      response("response-1", "Question?", "Answer"),
    );

    const reset = resetSession(used, deps);

    expect(reset.sessionId).not.toBe(used.sessionId);
    expect(reset.responses).toEqual([]);
    expect(reset.extractions).toEqual([]);
    expect(reset.claims).toEqual([]);
    expect(reset.pendingClaimOperations).toEqual([]);
  });
});
