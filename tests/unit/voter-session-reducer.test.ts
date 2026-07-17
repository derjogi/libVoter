import { describe, expect, it } from "vitest";
import {
  applyExtractionResult,
  createSessionSnapshot,
  recordResponse,
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
    createId: () => ids[index++],
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

    expect(drained.profileVersion).toBe(1);
    expect(drained.claims).toEqual([]);
    expect(drained.extractions[1]?.status).toBe("stale");
    expect(drained.queuedExtractionResults).toEqual([]);
  });
});
