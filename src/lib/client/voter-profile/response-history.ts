import type { TranscriptStep, UserResponse } from "@/types";

function isSeatSelection(step: TranscriptStep): boolean {
  return (
    step.component.type === "dropdown" &&
    step.component.data.questionId === "seat_selection"
  );
}

/** Responses that carry political preference signal, excluding seat setup. */
export function politicalUserResponses(
  steps: TranscriptStep[],
): UserResponse[] {
  return steps.flatMap((step) =>
    step.response && !isSeatSelection(step) ? [step.response] : [],
  );
}
