"use client";

import { Send, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatData, RawAnswer } from "@/types";

interface ChatInterfaceProps {
  data: ChatData;
  onSendMessage: (message: string, raw?: RawAnswer) => void;
  isLoading?: boolean;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}

/**
 * Single-turn chat row for the transcript: when active it shows the prompt and
 * an input; once locked it shows the message the user typed. The conversation
 * history itself lives in the transcript (one step per turn), and `useChat`
 * still tracks the full message list internally for the LLM.
 */
export function ChatInterface({
  data,
  onSendMessage,
  isLoading = false,
  disabled = false,
  locked = false,
  value,
  followupQuestion,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || disabled || isLoading) return;
    onSendMessage(trimmed, { kind: "chat", text: trimmed });
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(inputValue);
    }
  };

  const prompt = data.prompt;

  if (locked) {
    const answer = value?.kind === "chat" ? value.text : "";
    return (
      <div className="flex flex-col gap-2">
        {prompt && <h3 className="text-base font-medium">{prompt}</h3>}
        <div className="flex items-start justify-end space-x-2">
          <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">
            <p className="text-sm whitespace-pre-wrap">{answer}</p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-secondary-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {prompt && <h3 className="text-base font-medium">{prompt}</h3>}

      {followupQuestion && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => send(followupQuestion.question)}
          disabled={disabled || isLoading}
          className="self-start text-xs"
        >
          💡 {followupQuestion.question}
        </Button>
      )}

      <div className="flex space-x-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={data.placeholder || "Type your message..."}
          disabled={disabled || isLoading}
          className="flex-1"
        />
        <Button
          onClick={() => send(inputValue)}
          disabled={!inputValue.trim() || disabled || isLoading}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
