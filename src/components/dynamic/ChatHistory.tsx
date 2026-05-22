"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UserResponse } from "@/types";
import type { ComponentData } from "@/types/components.zod";
import type { SelectOption, YesNoData, SliderData } from "@/types";

export interface ChatHistoryProps {
  /** Ordered list of completed user responses. */
  steps: UserResponse[];
}

/** Format the user's raw response value into a one-line summary string. */
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
      return typeof value === "string"
        ? value.length > 80
          ? value.slice(0, 80) + "…"
          : value
        : String(value);
    }
    default:
      return String(value);
  }
}

/** Extract the question/show text from component data for display. */
function extractQuestionText(componentData?: ComponentData): string {
  if (!componentData) return "";

  const data = componentData.data as
    | YesNoData
    | (Record<string, unknown> & { question?: string; prompt?: string });

  if (componentData.type === "yesno") {
    return (data as YesNoData).statements
      .map((s) => s.statement)
      .join("\n");
  }
  return (data as Record<string, unknown>).question as string ??
    (data as Record<string, unknown>).prompt as string ??
    "";
}

/** A short label for the step type shown in the collapsed header badge. */
function stepTypeLabel(componentType: string, _componentData?: ComponentData): string {
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

interface HistoryStepProps {
  step: UserResponse;
  stepIndex: number;
}

function HistoryStep({ step, stepIndex }: HistoryStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = formatResponseSummary(
    step.componentType,
    step.value,
    step.componentData,
  );
  const questionText = step.question ?? extractQuestionText(step.componentData);
  const typeLabel = stepTypeLabel(step.componentType, step.componentData);

  // Build extra detail shown only when expanded
  function renderExpandedDetail() {
    const cd = step.componentData;
    if (!cd) return null;

    switch (cd.type) {
      case "yesno": {
        const sData = cd.data as YesNoData;
        return (
          <div className="space-y-2">
            {sData.statements.map((stmt) => (
              <div key={stmt.statement} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground mt-0.5">
                    {stmt.context
                      ? `Context: ${stmt.context}`
                      : `Statement: ${stmt.statement}`}
                  </span>
                <span className="flex-1">{stmt.statement}</span>
              </div>
            ))}
          </div>
        );
      }
      case "multiselect":
      case "dropdown": {
        const options = (cd.data as { options?: SelectOption[] }).options ?? [];
        // Read selected IDs from value
        const selectedIds: string[] = Array.isArray(step.value)
          ? (step.value as string[])
          : typeof step.value === "string"
            ? step.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
            : [];
        return (
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => (
              <Badge
                key={opt.id}
                variant={selectedIds.includes(opt.id) ? "default" : "outline"}
                className="text-xs"
              >
                {opt.label}
              </Badge>
            ))}
          </div>
        );
      }
      case "slider": {
        const sData = cd.data as SliderData;
        const sliderValue = typeof step.value === "number"
          ? step.value
          : typeof step.value === "string"
            ? Number(step.value)
            : null;
        return (
          <div className="text-sm text-muted-foreground">
            <span>
              {sliderValue ?? "—"}
              {" "}/{" "}
              {sData.min}–{sData.max}
            </span>
            {sData.unit && <span className="ml-1">{sData.unit}</span>}
          </div>
        );
      }
      default:
        return null;
    }
  }

  const hasDetail =
    !!step.componentData &&
    (step.componentData.type === "yesno" ||
      step.componentData.type === "multiselect" ||
      step.componentData.type === "dropdown" ||
      step.componentData.type === "slider");

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 py-3 px-1 text-left hover:bg-accent/50 rounded-md transition-colors cursor-pointer"
        aria-expanded={isExpanded}
      >
        {/* Expand / collapse chevron */}
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>

        {/* Step number / AI avatar */}
        <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs text-primary font-semibold">
          {stepIndex + 1}
        </span>

        {/* Question + response summary */}
        <div className="flex-1 min-w-0">
          {questionText && (
            <p className="text-sm truncate" title={questionText}>
              {questionText}
            </p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
              {typeLabel}
            </Badge>
            <span className="text-sm text-muted-foreground truncate">
              {summary}
            </span>
          </div>
        </div>

        <span className="flex-shrink-0 text-xs text-muted-foreground hidden sm:block">
          {step.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </button>

      {isExpanded && hasDetail && (
        <div className="px-9 pb-3">
          {renderExpandedDetail()}
        </div>
      )}
    </div>
  );
}

export function ChatHistory({ steps }: ChatHistoryProps) {
  if (steps.length === 0) return null;

  return (
    <ul
      className="divide-y divide-border/50"
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
