import type { ResponseValue, UserResponse } from "@/types";

function formatResponseValue(value: ResponseValue): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Formats one stored response for an AI prompt without losing the question that
 * gave the answer its meaning. Older response-only sessions may not have the
 * visible question snapshot, so their stable question id remains the fallback.
 */
export function formatUserResponse(response: UserResponse): string {
  const question = response.question?.trim() || response.questionId;
  return JSON.stringify({
    question,
    answer: formatResponseValue(response.value),
  });
}

export function formatUserResponses(responses: UserResponse[]): string {
  return `[${responses.map(formatUserResponse).join(",")}]`;
}
