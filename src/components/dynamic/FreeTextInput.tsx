"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FreeTextData, RawAnswer } from "@/types";

interface FreeTextInputProps {
  data: FreeTextData;
  onResponse: (text: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function FreeTextInput({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: FreeTextInputProps) {
  const initialText = value?.kind === "freetext" ? value.text : "";
  const [text, setText] = useState(initialText);
  const characterCount = text.length;
  const maxLength = data.maxLength || 1000;

  const handleSubmit = () => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    onResponse(`Prompt: ${data.prompt}\nResponse: ${trimmed}`, {
      kind: "freetext",
      text: trimmed,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{data.prompt}</h3>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder={data.placeholder}
        disabled={disabled || locked}
        maxLength={maxLength}
        rows={locked ? 3 : 5}
        className="resize-none"
      />

      {!locked && (
        <>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Share your detailed thoughts</span>
            <span>
              {characterCount}/{maxLength}
            </span>
          </div>
          <Button onClick={handleSubmit} disabled={disabled || !text.trim()}>
            <Send className="mr-2 h-4 w-4" />
            Submit Response
          </Button>
        </>
      )}
    </div>
  );
}
