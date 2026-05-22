"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserResponse } from "@/types";
import type { ComponentData, YesNoData } from "@/types/components.zod";

export interface ChatHistoryProps {
  /** Ordered list of completed user responses. */
  steps: UserResponse[];
  /** Render collapsed (header only) unless overridden. */
  isCollapsed?: boolean;
  /** Called when the user toggles the collapse state from the header button. */
  onToggle?: () => void;
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

export function ChatHistory({
  steps,
  isCollapsed,
  onToggle,
}: ChatHistoryProps) {
  const isEmpty = steps.length === 0;
  const ref = useRef<HTMLUListElement>(null);

  // Auto-scroll the history to the bottom whenever steps grow.
  // useLayoutEffect runs synchronously after DOM mutations but *before*
  // the browser paints, so the scroll adjustment is visible on the very
  // first render pass.  A requestAnimationFrame guard covers the edge case
  // where the browser increments scrollHeight after layout (e.g. font
  // loading, late images).
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (ref.current) {
        const last = ref.current.lastElementChild;
        last?.scrollIntoView?.({ block: "end", behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [steps]);

  if (isEmpty) return null;

  return (
    <div className="flex flex-col min-h-0 border rounded-md overflow-hidden border-border/50">
      {/* Collapsible header bar */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer w-full border-b border-border/30"
        aria-expanded={!isCollapsed}
      >
        <span className="flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {steps.length} {steps.length === 1 ? "response" : "responses"}
        </span>
        {isCollapsed ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible body */}
      {!isCollapsed && (
        <ul
          ref={ref}
          className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50 scroll-smooth"
          aria-label="Answer history"
        >
          {steps.map((step, i) => (
            <li key={step.id}>
              <HistoryStep step={step} stepIndex={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
