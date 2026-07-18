import { z } from "zod";
import { ComponentDataSchema } from "./components.zod";

export const claimContentSchema = z
  .object({
    statement: z.string().trim().min(1),
    conditions: z.array(z.string().trim().min(1)),
    topicTags: z.array(z.string().trim().min(1)),
    proposedImportance: z.number().min(0).max(1),
  })
  .strict();

/**
 * Untrusted model output. References are prompt-local aliases (for example
 * `claim-2`), never persisted claim ids; the trusted mapping layer resolves
 * them before producing a reducer delta.
 */
export const extractedClaimOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), content: claimContentSchema }).strict(),
  z
    .object({
      kind: z.literal("revise"),
      targetRef: z.string().trim().min(1),
      content: claimContentSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("retract"), targetRef: z.string().trim().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("uncertain"),
      targetRef: z.string().trim().min(1).optional(),
      content: claimContentSchema,
      reason: z.string().trim().min(1),
    })
    .strict(),
]);

export const claimOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), content: claimContentSchema }),
  z.object({
    kind: z.literal("revise"),
    targetClaimId: z.string().min(1),
    content: claimContentSchema,
  }),
  z.object({ kind: z.literal("retract"), targetClaimId: z.string().min(1) }),
  z.object({
    kind: z.literal("uncertain"),
    targetClaimId: z.string().min(1).nullable(),
    content: claimContentSchema,
    reason: z.string().trim().min(1),
  }),
]);

export const extractionResultSchema = z.object({
  responseId: z.string().min(1),
  baseProfileVersion: z.number().int().nonnegative(),
  operations: z.array(claimOperationSchema),
});

export const sessionResponseSchema = z.object({
  id: z.string().min(1),
  question: z.string(),
  answer: z.string(),
  componentType: z.enum([
    "chat",
    "dropdown",
    "multiselect",
    "slider",
    "yesno",
    "freetext",
    "priority",
  ]),
  submittedAt: z.string().datetime(),
  kind: z.enum(["political", "seat-selection"]),
});

export const voterClaimRevisionSchema = claimContentSchema.extend({
  claimId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revision: z.number().int().positive(),
  confirmedImportance: z.number().min(0).max(1).nullable(),
  status: z.enum(["active", "superseded", "retracted"]),
  sourceResponseId: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const extractionStateSchema = z.object({
  responseId: z.string().min(1),
  baseProfileVersion: z.number().int().nonnegative(),
  status: z.enum([
    "pending",
    "queued",
    "applied",
    "stale",
    "failed",
    "skipped",
  ]),
  error: z.string().optional(),
});

export const pendingClaimOperationSchema = z.object({
  responseId: z.string().min(1),
  targetClaimId: z.string().min(1).nullable(),
  content: claimContentSchema,
  reason: z.string().trim().min(1),
  createdAt: z.string().datetime(),
});

const rawAnswerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dropdown"),
    id: z.string(),
    label: z.string(),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("multiselect"),
    ids: z.array(z.string()),
    labels: z.array(z.string()),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("slider"),
    value: z.number(),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("yesno"),
    responses: z.array(z.enum(["agree", "disagree", "skip"])),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("freetext"),
    text: z.string(),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("chat"),
    text: z.string(),
    additionalContext: z.string().optional(),
  }),
  z.object({
    kind: z.literal("priority"),
    rankedIds: z.array(z.string()),
    rankedLabels: z.array(z.string()),
    additionalContext: z.string().optional(),
  }),
]);

export const sessionTranscriptStepSchema = z.object({
  id: z.string().min(1),
  component: ComponentDataSchema,
  locked: z.boolean(),
  answer: rawAnswerSchema.optional(),
  responseId: z.string().min(1).optional(),
});

export const sessionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    selectedRace: z.string().min(1).nullable(),
    profileVersion: z.number().int().nonnegative(),
    responses: z.array(sessionResponseSchema),
    claims: z.array(voterClaimRevisionSchema),
    extractions: z.array(extractionStateSchema),
    queuedExtractionResults: z.array(extractionResultSchema),
    pendingClaimOperations: z.array(pendingClaimOperationSchema),
    transcriptSteps: z.array(sessionTranscriptStepSchema),
  })
  .superRefine((snapshot, ctx) => {
    const responsesById = new Map(
      snapshot.responses.map((response) => [response.id, response]),
    );
    const duplicateResponseIds = snapshot.responses.filter(
      (response, index) =>
        snapshot.responses.findIndex((item) => item.id === response.id) !==
        index,
    );
    if (duplicateResponseIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["responses"],
        message: "Response ids must be unique",
      });
    }

    const requireResponse = (
      responseId: string,
      path: (string | number)[],
      politicalOnly = false,
    ) => {
      const response = responsesById.get(responseId);
      if (!response || (politicalOnly && response.kind !== "political")) {
        ctx.addIssue({
          code: "custom",
          path,
          message: politicalOnly
            ? "Must reference a political response"
            : "Must reference an existing response",
        });
      }
    };

    snapshot.extractions.forEach((extraction, index) => {
      requireResponse(
        extraction.responseId,
        ["extractions", index, "responseId"],
        extraction.status !== "skipped",
      );
    });
    snapshot.queuedExtractionResults.forEach((result, index) => {
      requireResponse(
        result.responseId,
        ["queuedExtractionResults", index, "responseId"],
        true,
      );
    });
    snapshot.pendingClaimOperations.forEach((operation, index) => {
      requireResponse(
        operation.responseId,
        ["pendingClaimOperations", index, "responseId"],
        true,
      );
    });
    snapshot.claims.forEach((claim, index) => {
      requireResponse(
        claim.sourceResponseId,
        ["claims", index, "sourceResponseId"],
        true,
      );
    });
    snapshot.transcriptSteps.forEach((step, index) => {
      if (step.responseId) {
        requireResponse(step.responseId, [
          "transcriptSteps",
          index,
          "responseId",
        ]);
      }
    });
  });

export type ClaimContent = z.infer<typeof claimContentSchema>;
export type ExtractedClaimOperation = z.infer<
  typeof extractedClaimOperationSchema
>;
export type ClaimOperation = z.infer<typeof claimOperationSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type VoterClaimRevision = z.infer<typeof voterClaimRevisionSchema>;
export type ExtractionState = z.infer<typeof extractionStateSchema>;
export type PendingClaimOperation = z.infer<typeof pendingClaimOperationSchema>;
export type SessionTranscriptStep = z.infer<typeof sessionTranscriptStepSchema>;
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
