import type { ComponentData, YesNoData } from "@/types/components.zod";

/**
 * Extract the human-readable question/prompt text from a component spec.
 *
 * Used both by the transcript (to label each step) and by `page.tsx` (to store
 * the question text on each derived `UserResponse`). For `yesno` the statements
 * themselves are the question, so they are joined with newlines.
 */
export function extractQuestionText(componentData?: ComponentData): string {
  if (!componentData) return "";

  if (componentData.type === "yesno") {
    return (componentData.data as YesNoData).statements
      .map((s) => s.statement)
      .join("\n");
  }

  const data = componentData.data as Record<string, unknown>;
  return (
    (data.question as string) ??
    (data.prompt as string) ??
    (data.label as string) ??
    ""
  );
}
