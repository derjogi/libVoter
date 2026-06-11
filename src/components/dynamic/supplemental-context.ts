import type { RawAnswer } from "@/types";

export const SUPPLEMENTAL_CONTEXT_PLACEHOLDER =
  "Anything else you want the AI to know, or a different topic to focus on?";

export function formatSupplementalContext(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `\n\nAdditional context:\n${trimmed}`;
}

export function getInitialSupplementalContext(value?: RawAnswer) {
  if (!value || !("additionalContext" in value)) return "";
  return typeof value.additionalContext === "string"
    ? value.additionalContext
    : "";
}
