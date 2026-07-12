import type { UserResponse } from "@/types";

const FIRST_SUMMARY_ANSWER_COUNT = 3;
const ANSWERS_BETWEEN_SUMMARIES = 2;

function isSubstantiveResponse(response: UserResponse): boolean {
  return response.questionId !== "seat_selection";
}

function isFreeTextResponse(response: UserResponse): boolean {
  return (
    response.componentType === "chat" || response.componentType === "freetext"
  );
}

export function countSubstantiveResponses(responses: UserResponse[]): number {
  return responses.filter(isSubstantiveResponse).length;
}

export function shouldRequestPreferenceSummary(
  responses: UserResponse[],
  lastRequestedAnswerCount: number,
): boolean {
  const substantiveResponses = responses.filter(isSubstantiveResponse);
  const answerCount = substantiveResponses.length;

  if (
    answerCount < FIRST_SUMMARY_ANSWER_COUNT ||
    answerCount <= lastRequestedAnswerCount
  ) {
    return false;
  }

  if (lastRequestedAnswerCount === 0) return true;

  const latestResponse = substantiveResponses.at(-1);
  return (
    (latestResponse !== undefined && isFreeTextResponse(latestResponse)) ||
    answerCount - lastRequestedAnswerCount >= ANSWERS_BETWEEN_SUMMARIES
  );
}
