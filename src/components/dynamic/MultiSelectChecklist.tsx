"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MultiSelectData, RawAnswer } from "@/types";
import { SupplementalContextInput } from "./SupplementalContextInput";
import {
  formatSupplementalContext,
  getInitialSupplementalContext,
} from "./supplemental-context";

interface MultiSelectChecklistProps {
  data: MultiSelectData;
  onResponse: (selectedAnswers: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function MultiSelectChecklist({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: MultiSelectChecklistProps) {
  const initialIds = value?.kind === "multiselect" ? value.ids : [];
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [supplementalContext, setSupplementalContext] = useState(
    getInitialSupplementalContext(value),
  );

  const handleOptionToggle = (optionId: string, checked: boolean) => {
    if (checked) {
      if (data.maxSelections && selectedIds.length >= data.maxSelections) {
        return; // Don't allow more selections than max
      }
      setSelectedIds([...selectedIds, optionId]);
    } else {
      setSelectedIds(selectedIds.filter((id) => id !== optionId));
    }
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0 && !supplementalContext.trim()) return;
    const selectedOptions = selectedIds
      .map((id) => data.options.find((opt) => opt.id === id))
      .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined);
    const labels =
      selectedOptions.length > 0
        ? selectedOptions.map((opt) => opt.label)
        : [data.question];
    onResponse(
      `${labels.join("\n")}${formatSupplementalContext(supplementalContext)}`,
      {
        kind: "multiselect",
        ids: selectedOptions.map((opt) => opt.id),
        labels,
        additionalContext: supplementalContext.trim(),
      },
    );
  };

  const selectedCount = selectedIds.length;
  const maxSelections = data.maxSelections;
  const canSubmit = selectedCount > 0 || supplementalContext.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">{data.question}</h3>
        {maxSelections && (
          <Badge variant="secondary" className="flex-shrink-0">
            {selectedCount}/{maxSelections} selected
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {data.options.map((option) => (
          <div key={option.id} className="flex items-start space-x-3">
            <Checkbox
              id={option.id}
              checked={selectedIds.includes(option.id)}
              onCheckedChange={(checked) =>
                handleOptionToggle(option.id, checked as boolean)
              }
              disabled={
                disabled ||
                locked ||
                (maxSelections !== undefined &&
                  !selectedIds.includes(option.id) &&
                  selectedIds.length >= maxSelections)
              }
              className="mt-1"
            />
            <div className="flex-1">
              <label
                htmlFor={option.id}
                className="text-sm font-medium cursor-pointer"
              >
                {option.label}
              </label>
              {option.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <SupplementalContextInput
        disabled={disabled}
        locked={locked}
        value={value}
        onChange={setSupplementalContext}
      />

      {!locked && (
        <Button onClick={handleSubmit} disabled={disabled || !canSubmit}>
          Continue ({selectedCount} selected)
        </Button>
      )}
    </div>
  );
}
