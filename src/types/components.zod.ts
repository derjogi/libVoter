// Zod schemas mirroring the *Data interfaces in src/types/index.ts. These are
// used to validate LLM-generated component specs and other prompt outputs.
import { z } from "zod";

// === Component data schemas ===

export const SelectOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional().default(""),
});

export const ChatDataSchema = z.object({
  messages: z.array(z.any()).optional().default([]),
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

// === Top-level LLM output: COMPONENT_SELECTOR ===

export const ComponentSpecSchema = z.discriminatedUnion("component", [
  z.object({
    component: z.literal("chat"),
    data: ChatDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    component: z.literal("yesno"),
    data: YesNoDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    component: z.literal("multiselect"),
    data: MultiSelectDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    component: z.literal("dropdown"),
    data: DropdownDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    component: z.literal("freetext"),
    data: FreeTextDataSchema,
    reasoning: z.string().optional(),
  }),
  z.object({
    component: z.literal("slider"),
    data: SliderDataSchema,
    reasoning: z.string().optional(),
  }),
]);

export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;

// === LLM output: NEXT_QUESTION_GENERAL / FOLLOWUP_QUESTION ===

export const QuestionResponseSchema = z.object({
  question: z.string().min(1),
  type: z.string().optional(),
  context: z.string().optional(),
  reasoning: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;

// === Safe fallback component ===

export const SAFE_FALLBACK_COMPONENT: ComponentSpec = {
  component: "chat",
  reasoning: "Validation fallback — the AI returned an invalid component spec.",
  data: {
    messages: [],
    placeholder:
      "Could you rephrase that? I had trouble building the next question.",
  },
};

/**
 * Try to parse and validate an LLM JSON response into a ComponentSpec.
 * Returns the validated spec, or the safe-fallback chat component if the
 * response is malformed (with diagnostics logged to the console).
 */
export function parseComponentSpec(raw: string): {
  spec: ComponentSpec;
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

  const result = ComponentSpecSchema.safeParse(parsed);
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
