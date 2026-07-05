import { describe, expect, it } from "vitest";
import {
  countSubstantiveResponses,
  shouldRequestPreferenceSummary,
} from "@/lib/client/preference-summary-refresh";
import type { ComponentType, UserResponse } from "@/types";

function response(
  questionId: string,
  componentType: ComponentType = "dropdown",
): UserResponse {
  return {
    id: `response-${questionId}`,
    questionId,
    componentType,
    value: `Answer to ${questionId}`,
    timestamp: new Date("2026-07-05T00:00:00Z"),
  };
}

const ward = response("ward_selection");
const ordinary = (number: number) => response(`question_${number}`);

describe("preference summary refresh policy", () => {
  it("does not count electorate selection as a substantive answer", () => {
    expect(
      countSubstantiveResponses([ward, ordinary(1), ordinary(2), ordinary(3)]),
    ).toBe(3);
  });

  it("waits for three substantive answers before the first summary", () => {
    expect(
      shouldRequestPreferenceSummary([ward, ordinary(1), ordinary(2)], 0),
    ).toBe(false);
    expect(
      shouldRequestPreferenceSummary(
        [ward, ordinary(1), ordinary(2), ordinary(3)],
        0,
      ),
    ).toBe(true);
  });

  it("does not let free text build the first summary early", () => {
    expect(
      shouldRequestPreferenceSummary(
        [ward, ordinary(1), response("more_detail", "freetext")],
        0,
      ),
    ).toBe(false);
  });

  it("renews after two ordinary answers since the previous request", () => {
    const firstSummary = [ward, ordinary(1), ordinary(2), ordinary(3)];

    expect(
      shouldRequestPreferenceSummary([...firstSummary, ordinary(4)], 3),
    ).toBe(false);
    expect(
      shouldRequestPreferenceSummary(
        [...firstSummary, ordinary(4), ordinary(5)],
        3,
      ),
    ).toBe(true);
  });

  it.each(["chat", "freetext"] as const)(
    "renews immediately for a %s answer after the first summary",
    (componentType) => {
      expect(
        shouldRequestPreferenceSummary(
          [
            ward,
            ordinary(1),
            ordinary(2),
            ordinary(3),
            response("extra_detail", componentType),
          ],
          3,
        ),
      ).toBe(true);
    },
  );

  it("does not request the same substantive response count twice", () => {
    expect(
      shouldRequestPreferenceSummary(
        [ward, ordinary(1), ordinary(2), ordinary(3)],
        3,
      ),
    ).toBe(false);
  });

  it("resets the two-answer interval after a free-text renewal", () => {
    const afterFreeText = [
      ward,
      ordinary(1),
      ordinary(2),
      ordinary(3),
      response("extra_detail", "chat"),
    ];

    expect(
      shouldRequestPreferenceSummary([...afterFreeText, ordinary(5)], 4),
    ).toBe(false);
    expect(
      shouldRequestPreferenceSummary(
        [...afterFreeText, ordinary(5), ordinary(6)],
        4,
      ),
    ).toBe(true);
  });
});
