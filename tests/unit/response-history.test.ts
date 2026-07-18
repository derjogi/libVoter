import { describe, expect, it } from "vitest";
import { politicalUserResponses } from "@/lib/client/voter-profile/response-history";
import type { TranscriptStep, UserResponse } from "@/types";

function step(questionId: string): TranscriptStep {
  const response: UserResponse = {
    id: `response-${questionId}`,
    questionId,
    componentType: "dropdown",
    value: questionId,
    timestamp: new Date("2026-07-19T00:00:00.000Z"),
  };
  return {
    id: `step-${questionId}`,
    locked: true,
    component: {
      type: "dropdown",
      data: {
        question: questionId,
        questionId,
        options: [],
        placeholder: "",
      },
    },
    response,
  };
}

describe("political response history", () => {
  it("excludes seat selection from ranking and right-panel history", () => {
    expect(
      politicalUserResponses([
        step("seat_selection"),
        step("housing_priority"),
      ]).map((response) => response.questionId),
    ).toEqual(["housing_priority"]);
  });
});
