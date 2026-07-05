/** @vitest-environment happy-dom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RightPanel } from "@/components/layout/RightPanel";
import type { ComponentType, UserResponse } from "@/types";

const summarizeUserPreferences = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/prompts", () => ({
  summarizeUserPreferences,
}));

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

describe("RightPanel preference summary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    summarizeUserPreferences.mockReset();
    summarizeUserPreferences.mockResolvedValue({
      success: true,
      data: "Current preference summary",
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(responses: UserResponse[]) {
    await act(async () => {
      root.render(
        createElement(RightPanel, {
          candidates: [],
          confidence: 0,
          userResponses: responses,
        }),
      );
      await Promise.resolve();
    });
  }

  it("requests at three substantive answers and then every second answer", async () => {
    await render([ward, ordinary(1), ordinary(2)]);
    expect(summarizeUserPreferences).not.toHaveBeenCalled();

    await render([ward, ordinary(1), ordinary(2), ordinary(3)]);
    expect(summarizeUserPreferences).toHaveBeenCalledTimes(1);

    await render([ward, ordinary(1), ordinary(2), ordinary(3), ordinary(4)]);
    expect(summarizeUserPreferences).toHaveBeenCalledTimes(1);

    await render([
      ward,
      ordinary(1),
      ordinary(2),
      ordinary(3),
      ordinary(4),
      ordinary(5),
    ]);
    expect(summarizeUserPreferences).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing summary visible during a free-text renewal", async () => {
    let resolveRenewal:
      | ((value: { success: boolean; data: string }) => void)
      | undefined;
    summarizeUserPreferences
      .mockResolvedValueOnce({ success: true, data: "Initial summary" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRenewal = resolve;
        }),
      );

    await render([ward, ordinary(1), ordinary(2), ordinary(3)]);
    expect(container.textContent).toContain("Initial summary");

    await render([
      ward,
      ordinary(1),
      ordinary(2),
      ordinary(3),
      response("extra_detail", "freetext"),
    ]);

    expect(container.textContent).toContain("Initial summary");
    expect(container.textContent).toContain("Updating summary...");

    await act(async () => {
      resolveRenewal?.({ success: true, data: "Renewed summary" });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Renewed summary");
  });
});
