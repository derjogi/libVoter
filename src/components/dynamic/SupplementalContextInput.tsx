"use client";

import { useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { RawAnswer } from "@/types";
import {
  getInitialSupplementalContext,
  SUPPLEMENTAL_CONTEXT_PLACEHOLDER,
} from "./supplemental-context";

interface SupplementalContextInputProps {
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
  onChange?: (text: string) => void;
}

export function SupplementalContextInput({
  disabled = false,
  locked = false,
  value,
  onChange,
}: SupplementalContextInputProps) {
  const [context, setContext] = useState(getInitialSupplementalContext(value));
  const inputId = useId();

  if (locked && !context.trim()) {
    return null;
  }

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setContext(nextValue);
    onChange?.(nextValue);
  };

  return (
    <div className="border-t pt-3 mt-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        Additional context or redirect
      </label>
      <Textarea
        id={inputId}
        value={context}
        onChange={handleChange}
        disabled={disabled || locked}
        placeholder={SUPPLEMENTAL_CONTEXT_PLACEHOLDER}
        rows={locked ? 2 : 3}
        maxLength={1000}
        className="mt-2 resize-none"
        aria-label="Additional context or redirect"
      />
    </div>
  );
}
