"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DropdownData, RawAnswer } from "@/types";
import { SupplementalContextInput } from "./SupplementalContextInput";
import {
  formatSupplementalContext,
  getInitialSupplementalContext,
} from "./supplemental-context";

interface DropdownSelectProps {
  data: DropdownData;
  onResponse: (selectedLabel: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function DropdownSelect({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: DropdownSelectProps) {
  const initialId = value?.kind === "dropdown" ? value.id : "";
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [supplementalContext, setSupplementalContext] = useState(
    getInitialSupplementalContext(value),
  );

  const handleSubmit = () => {
    if (!selectedId) return;
    const selectedOption = data.options.find((o) => o.id === selectedId);
    if (!selectedOption) return;
    onResponse(
      `Question: ${data.question}\nAnswer: ${selectedOption.label}${formatSupplementalContext(
        supplementalContext,
      )}`,
      {
        kind: "dropdown",
        id: selectedOption.id,
        label: selectedOption.label,
        additionalContext: supplementalContext.trim(),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{data.question}</h3>

      <Select
        value={selectedId}
        onValueChange={setSelectedId}
        disabled={disabled || locked}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={data.placeholder || "Select an option..."}
          />
        </SelectTrigger>
        <SelectContent>
          {data.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div className="flex flex-col">
                <span>{option.label}</span>
                {option.description && (
                  <span className="text-sm text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!locked && (
        <Button onClick={handleSubmit} disabled={disabled || !selectedId}>
          Continue
        </Button>
      )}

      <SupplementalContextInput
        disabled={disabled}
        locked={locked}
        value={value}
        onChange={setSupplementalContext}
      />
    </div>
  );
}
