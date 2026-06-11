// Zod schemas for every shape that crosses a trust boundary:
//   - LLM-generated component specs (COMPONENT_SELECTOR)
//   - LLM-generated question objects (NEXT_QUESTION_GENERAL / FOLLOWUP_QUESTION)
//   - LLM-generated RAG context blobs (RAGQueryEngine)
//
// The schemas are the single source of truth — TS types live in
// src/types/index.ts as `z.infer` aliases so the wire shape, the validator,
// and the dynamic-component renderer can never drift.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Per-component data shapes
// ---------------------------------------------------------------------------

export const SelectOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional().default(""),
});

export const ChatDataSchema = z.object({
  messages: z.array(z.any()).optional(),
  placeholder: z.string().optional(),
  prompt: z.string().optional(),
});

export const YesNoDataSchema = z.object({
  statements: z
    .array(
      z.object({
        statement: z.string(),
        context: z.string().optional(),
      }),
    )
    .min(1),
});

export const MultiSelectDataSchema = z.object({
  question: z.string(),
  options: z.array(SelectOptionSchema).min(1),
  maxSelections: z.number().int().positive().optional(),
  questionId: z.string().optional(),
});

export const DropdownDataSchema = z.object({
  question: z.string(),
  options: z.array(SelectOptionSchema).min(1),
  placeholder: z.string().optional(),
  questionId: z.string().optional(),
});

export const FreeTextDataSchema = z.object({
  prompt: z.string(),
  placeholder: z.string(),
  maxLength: z.number().int().positive().optional(),
});

export const SliderDataSchema = z.object({
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
});

export const PriorityRankingDataSchema = z.object({
  question: z.string(),
  options: z.array(SelectOptionSchema).min(2),
  description: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Discriminated union — a single ComponentData shape from end to end.
// The discriminator is `type` (matches what the renderer switches on); the
// COMPONENT_SELECTOR prompt instructs the LLM to use the same key, so no
// mapping/translation is needed between the wire and the React component.
// ---------------------------------------------------------------------------

export const ComponentDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat"),
    data: ChatDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("yesno"),
    data: YesNoDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("multiselect"),
    data: MultiSelectDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("dropdown"),
    data: DropdownDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("freetext"),
    data: FreeTextDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("slider"),
    data: SliderDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal("priority"),
    data: PriorityRankingDataSchema,
    reasoning: z.string().optional(),
  }),
]);

export type ComponentData = z.infer<typeof ComponentDataSchema>;
export type ComponentType = ComponentData["type"];

// Per-component data type aliases used by individual renderers.
export type ChatData = z.infer<typeof ChatDataSchema>;
export type YesNoData = z.infer<typeof YesNoDataSchema>;
export type MultiSelectData = z.infer<typeof MultiSelectDataSchema>;
export type DropdownData = z.infer<typeof DropdownDataSchema>;
export type FreeTextData = z.infer<typeof FreeTextDataSchema>;
export type SliderData = z.infer<typeof SliderDataSchema>;
export type PriorityRankingData = z.infer<typeof PriorityRankingDataSchema>;
export type SelectOption = z.infer<typeof SelectOptionSchema>;

// ---------------------------------------------------------------------------
// Question response (NEXT_QUESTION_GENERAL / FOLLOWUP_QUESTION)
// ---------------------------------------------------------------------------

export const QuestionResponseSchema = z.object({
  question: z.string().min(1),
  type: z.string().optional(),
  context: z.string().optional(),
  reasoning: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;

// ---------------------------------------------------------------------------
// RAG response (RAGQueryEngine.queryWithContext)
// ---------------------------------------------------------------------------

export const RAGPolicySchema = z.object({
  topic: z.string(),
  stance: z.string(),
  details: z.string().optional(),
  sources: z.array(z.string()).optional(),
});

export const RAGResponseSchema = z.object({
  candidates: z.array(z.any()).optional().default([]),
  policies: z.array(RAGPolicySchema).optional().default([]),
  sources: z.array(z.string()).optional().default([]),
});

export type RAGResponse = z.infer<typeof RAGResponseSchema>;

// ---------------------------------------------------------------------------
// Safe fallback when the LLM output is unusable.
// ---------------------------------------------------------------------------

export const SAFE_FALLBACK_COMPONENT: ComponentData = {
  type: "chat",
  reasoning: "Validation fallback — the AI returned an invalid component spec.",
  data: {
    messages: [],
    placeholder:
      "Could you rephrase that? I had trouble building the next question.",
  },
};

// ---------------------------------------------------------------------------
// Parsers — each accepts a raw LLM string, returns the validated value
// (or a documented fallback) and never throws.
// ---------------------------------------------------------------------------

/**
 * Parse + validate an LLM JSON response into a ComponentData.
 * Returns the validated value, or the safe-fallback chat component if the
 * response is malformed (with diagnostics logged to the console).
 *
 * Also tolerates the legacy key `component` instead of `type`, in case an
 * older prompt/fixture sneaks through.
 */
export function parseComponentSpec(raw: string): {
  spec: ComponentData;
  ok: boolean;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("parseComponentSpec: invalid JSON", { raw, error: String(e) });
    return { spec: SAFE_FALLBACK_COMPONENT, ok: false, error: "invalid JSON" };
  }

  // Back-compat: rewrite `component` → `type` if present.
  if (
    parsed &&
    typeof parsed === "object" &&
    "component" in (parsed as Record<string, unknown>) &&
    !("type" in (parsed as Record<string, unknown>))
  ) {
    const p = parsed as Record<string, unknown>;
    p.type = p.component;
    delete p.component;
  }

  const result = ComponentDataSchema.safeParse(parsed);
  if (!result.success) {
    console.warn("parseComponentSpec: schema mismatch", {
      issues: result.error.issues,
      parsed,
    });
    return {
      spec: SAFE_FALLBACK_COMPONENT,
      ok: false,
      error: result.error.issues.map((i) => i.message).join("; "),
    };
  }

  return { spec: result.data, ok: true };
}

/**
 * Validate an LLM JSON response describing a question (next/followup).
 * Returns null on failure so the caller can supply its own fallback.
 */
export function parseQuestionResponse(raw: string): QuestionResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = QuestionResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Validate an LLM JSON response describing a RAG context blob.
 * Returns null on failure so the caller can fall back to its
 * heuristic-extracted policies + sources.
 */
export function parseRAGResponse(raw: string): RAGResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = RAGResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.warn("parseRAGResponse: schema mismatch", {
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Deprecated aliases (kept so older code keeps compiling during the renaming).
// ---------------------------------------------------------------------------

/** @deprecated use ComponentData / ComponentDataSchema */
export const ComponentSpecSchema = ComponentDataSchema;
/** @deprecated use ComponentData */
export type ComponentSpec = ComponentData;
