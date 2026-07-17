import { z } from "zod";

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
]);

export const claimOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), content: claimContentSchema }),
  z.object({
    kind: z.literal("revise"),
    targetClaimId: z.string().min(1),
    content: claimContentSchema,
  }),
  z.object({ kind: z.literal("retract"), targetClaimId: z.string().min(1) }),
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

export const sessionSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  profileVersion: z.number().int().nonnegative(),
  responses: z.array(sessionResponseSchema),
  claims: z.array(voterClaimRevisionSchema),
  extractions: z.array(extractionStateSchema),
  queuedExtractionResults: z.array(extractionResultSchema),
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
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
