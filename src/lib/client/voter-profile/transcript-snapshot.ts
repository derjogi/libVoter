import type { TranscriptStep, UserResponse } from "@/types";
import type {
  SessionResponse,
  SessionTranscriptStep,
} from "@/types/voter-claims.zod";

export function serializeTranscriptSteps(
  steps: TranscriptStep[],
): SessionTranscriptStep[] {
  return steps.map((step) => ({
    id: step.id,
    component: step.component,
    locked: step.locked,
    answer: step.answer,
    responseId: step.response?.id,
  }));
}

export function hydrateTranscriptSteps(
  steps: SessionTranscriptStep[],
  responses: SessionResponse[],
): TranscriptStep[] {
  const responsesById = new Map(
    responses.map((response) => [response.id, response]),
  );

  return steps.map((step) => {
    const persistedResponse = step.responseId
      ? responsesById.get(step.responseId)
      : undefined;
    const response: UserResponse | undefined = persistedResponse
      ? {
          id: persistedResponse.id,
          questionId:
            step.component.type === "dropdown"
              ? (step.component.data.questionId ?? persistedResponse.id)
              : persistedResponse.id,
          componentType: persistedResponse.componentType,
          question: persistedResponse.question,
          componentData: step.component,
          value: persistedResponse.answer,
          timestamp: new Date(persistedResponse.submittedAt),
        }
      : undefined;

    return {
      id: step.id,
      component: step.component,
      locked: step.locked,
      ...(step.answer ? { answer: step.answer } : {}),
      ...(response ? { response } : {}),
    };
  });
}
