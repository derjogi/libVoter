"use client";

import { GripVertical, MoveDown, MoveUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PriorityRankingData, RawAnswer } from "@/types";
import { SupplementalContextInput } from "./SupplementalContextInput";
import {
  formatSupplementalContext,
  getInitialSupplementalContext,
} from "./supplemental-context";

interface PriorityRankingProps {
  data: PriorityRankingData;
  onResponse: (rankedAnswer: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function PriorityRanking({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: PriorityRankingProps) {
  const initialOrder =
    value?.kind === "priority"
      ? data.options
          .map((opt) => ({
            ...opt,
            sortIndex: value.rankedIds.indexOf(opt.id),
          }))
          .sort((a, b) => a.sortIndex - b.sortIndex || 0)
          .map((opt) => opt.id)
      : data.options.map((opt) => opt.id);

  const [rankedIds, setRankedIds] = useState<string[]>(initialOrder);
  const [supplementalContext, setSupplementalContext] = useState(
    getInitialSupplementalContext(value),
  );

  const moveOption = (index: number, direction: "up" | "down") => {
    if (locked || disabled) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rankedIds.length) return;

    const newRankedIds = [...rankedIds];
    [newRankedIds[index], newRankedIds[newIndex]] = [
      newRankedIds[newIndex],
      newRankedIds[index],
    ];
    setRankedIds(newRankedIds);
  };

  const handleSubmit = () => {
    if (rankedIds.length === 0 && !supplementalContext.trim()) return;
    const rankedOptions = rankedIds
      .map((id) => data.options.find((opt) => opt.id === id))
      .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined);
    const labels =
      rankedOptions.length > 0
        ? rankedOptions.map((opt) => opt.label)
        : [data.question];
    onResponse(
      `${labels.join("\n")}${formatSupplementalContext(supplementalContext)}`,
      {
        kind: "priority",
        rankedIds: rankedOptions.map((opt) => opt.id),
        rankedLabels: labels,
        additionalContext: supplementalContext.trim(),
      },
    );
  };

  const getOptionById = (id: string) =>
    data.options.find((opt) => opt.id === id);

  const canSubmit =
    rankedIds.length > 0 || supplementalContext.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">{data.question}</h3>
      </div>

      {data.description && (
        <p className="text-sm text-muted-foreground">{data.description}</p>
      )}

      <div className="space-y-2" data-testid="priority-ranking-container">
        {rankedIds.map((optionId, index) => {
          const option = getOptionById(optionId);
          if (!option) return null;

          return (
            <div
              key={option.id}
              data-testid={`priority-option-${option.id}`}
              className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {index + 1}
              </span>

              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-move" />

              <div className="flex-1">
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                )}
              </div>

              {!locked && !disabled && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveOption(index, "up")}
                    disabled={index === 0}
                    aria-label={`Move ${option.label} up`}
                  >
                    <MoveUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveOption(index, "down")}
                    disabled={index === rankedIds.length - 1}
                    aria-label={`Move ${option.label} down`}
                  >
                    <MoveDown className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SupplementalContextInput
        disabled={disabled}
        locked={locked}
        value={value}
        onChange={setSupplementalContext}
      />

      {!locked && (
        <Button
          onClick={handleSubmit}
          disabled={disabled || !canSubmit}
          className="mt-2"
        >
          Continue ({rankedIds.length} ranked)
        </Button>
      )}
    </div>
  );
}
