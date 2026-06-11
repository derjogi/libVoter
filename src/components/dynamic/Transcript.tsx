"use client";

import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RawAnswer, TranscriptStep } from "@/types";
import { ComponentRenderer } from "./ComponentRenderer";

interface TranscriptProps {
  steps: TranscriptStep[];
  onResponse: (response: unknown, raw?: RawAnswer) => void;
  /** True while the next question is being compiled — shows a loading bubble. */
  isCompiling: boolean;
  /** True while an active chat turn is in flight. */
  isLoading?: boolean;
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}

/**
 * The full chat transcript: every question shown so far, stacked contiguously
 * inside one scroll area. Answered steps are greyed-out and non-interactive
 * (their widget still shows the chosen answer); the last unlocked step is the
 * active question. A loading bubble trails the list while the next question is
 * being compiled. Auto-scrolls to the newest content.
 */
export function Transcript({
  steps,
  onResponse,
  isCompiling,
  isLoading = false,
  followupQuestion,
}: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on growth/state
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length, isCompiling]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      <div className="flex flex-col divide-y divide-border/60">
        {steps.map((step) => (
          <div
            key={step.id}
            data-testid={step.locked ? "locked-step" : "active-step"}
            className={`py-4 first:pt-0 ${
              step.locked ? "opacity-60 pointer-events-none select-none" : ""
            }`}
          >
            <ComponentRenderer
              componentData={step.component}
              onResponse={onResponse}
              locked={step.locked}
              value={step.answer}
              disabled={step.locked}
              isLoading={!step.locked && isLoading}
              followupQuestion={!step.locked ? followupQuestion : undefined}
            />
          </div>
        ))}

        {isCompiling && (
          <div className="py-4 first:pt-0">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-current rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-current rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
                <span className="text-sm">
                  Thinking about your next question…
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
