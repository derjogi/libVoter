import { describe, expect, it } from "vitest";
import {
  hydrateTranscriptSteps,
  serializeTranscriptSteps,
} from "@/lib/client/voter-profile/transcript-snapshot";
import type { TranscriptStep } from "@/types";

const submittedAt = "2026-07-19T00:00:00.000Z";

const steps: TranscriptStep[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    locked: true,
    component: {
      type: "dropdown",
      data: {
        question: "Which electorate do you live in?",
        questionId: "seat_selection",
        options: [
          {
            id: "wellington-central",
            label: "Wellington Central",
            description: "",
          },
        ],
      },
    },
    answer: {
      kind: "dropdown",
      id: "wellington-central",
      label: "Wellington Central",
    },
    response: {
      id: "00000000-0000-4000-8000-000000000001",
      questionId: "seat_selection",
      componentType: "dropdown",
      question: "Which electorate do you live in?",
      componentData: {
        type: "dropdown",
        data: {
          question: "Which electorate do you live in?",
          questionId: "seat_selection",
          options: [
            {
              id: "wellington-central",
              label: "Wellington Central",
              description: "",
            },
          ],
        },
      },
      value: "Wellington Central",
      timestamp: new Date(submittedAt),
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    locked: false,
    component: {
      type: "chat",
      data: { prompt: "What matters most to you?" },
    },
  },
];

describe("transcript snapshot projection", () => {
  it("round-trips locked and active steps through the single session snapshot", () => {
    const responses = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        question: "Which electorate do you live in?",
        answer: "Wellington Central",
        componentType: "dropdown" as const,
        submittedAt,
        kind: "seat-selection" as const,
      },
    ];

    const persisted = serializeTranscriptSteps(steps);
    const hydrated = hydrateTranscriptSteps(persisted, responses);

    expect(hydrated).toEqual(steps);
    expect(hydrated[0]?.response?.timestamp).toBeInstanceOf(Date);
  });
});
