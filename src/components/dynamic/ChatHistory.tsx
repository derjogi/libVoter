"use client";

import type { UserResponse } from "@/types";
import type { ComponentData, YesNoData } from "@/types/components.zod";

export interface ChatHistoryProps {
  /** Ordered list of completed user responses. */
  steps: UserResponse[];
}

/** Format the user's raw response value into a display string. */
function formatResponseSummary(
  componentType: string,
  value: UserResponse["value"],
  _componentData?: ComponentData,
): string {
  if (typeof value === "string" && !value.match(/^Statement \d+:/)) {
    return value;
  }

  switch (componentType) {
    case "multiselect": {
      const selectedIds =
        Array.isArray(value) && value.every((v) => typeof v === "string")
          ? (value as string[])
          : [];
      return selectedIds.length > 0 ? selectedIds.join(", ") : "(no selection)";
    }
    case "dropdown": {
      return typeof value === "string" ? value : String(value);
    }
    case "yesno": {
      if (typeof value === "string") {
        const lines = value.split("\n");
        const responses: string[] = [];
        for (const line of lines) {
          const m = line.match(/^- Statement \d+: .* - Response:\s*(\w+)/);
          if (m) responses.push(m[1]);
        }
        return responses.length > 0 ? responses.join(", ") : value;
      }
      return String(value);
    }
    case "slider": {
      return typeof value === "number" ? `${value}` : String(value);
    }
    case "freetext": {
      return typeof value === "string" ? value : String(value);
    }
    default:
      return String(value);
  }
}

/** A short label for the step type shown in the history badge. */
function stepTypeLabel(componentType: string): string {
  switch (componentType) {
    case "dropdown":
      return "Ward selection";
    case "yesno":
      return "Agree / Disagree";
    case "multiselect":
      return "Topic selection";
    case "freetext":
      return "Free text";
    case "slider":
      return "Priority scale";
    default:
      return "Question";
  }
}

/** Extract the question/show text from component data for display.
 *  Exported so page.tsx can use the same logic before appending userResponses. */
export function extractQuestionText(componentData?: ComponentData): string {
  if (!componentData) return "";

  const data = componentData.data as
    | YesNoData
    | (Record<string, unknown> & { question?: string; prompt?: string });

  if (componentData.type === "yesno") {
    return (data as YesNoData).statements.map((s) => s.statement).join("\n");
  }
  return (
    ((data as Record<string, unknown>).question as string) ??
    ((data as Record<string, unknown>).prompt as string) ??
    ""
  );
}

interface HistoryStepProps {
  step: UserResponse;
  stepIndex: number;
}

function HistoryStep({ step, stepIndex }: HistoryStepProps) {
  const summary = formatResponseSummary(
    step.componentType,
    step.value,
    step.componentData,
  );

  return (
    <div className="border-b border-border/50 last:border-b-0 py-3 px-1">
      <div className="flex items-start gap-3">
        {/* Step number */}
        <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs text-primary font-semibold mt-0.5">
          {stepIndex + 1}
        </span>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Question text — always shown, always full */}
          {step.question && (
            <p className="text-sm font-medium">Q: {step.question}</p>
          )}

          {/* Answer text — always shown, never truncated */}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
            A: {summary}
          </p>
        </div>

        <span className="flex-shrink-0 text-xs text-muted-foreground hidden sm:block mt-0.5">
          {step.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

export function ChatHistory({ steps }: ChatHistoryProps) {
  if (steps.length === 0) return null;

  return (
    <ul
      className="divide-y divide-border/50 sm:border sm:border-border/50 sm:rounded-md"
      aria-label="Answer history"
    >
      {steps.map((step, i) => (
        <li key={step.id}>
          <HistoryStep step={step} stepIndex={i} />
        </li>
      ))}
    </ul>
  );
}
