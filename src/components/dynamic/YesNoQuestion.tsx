"use client";

import { SkipForward, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RawAnswer, YesNoData } from "@/types";

type YesNoResponse = "agree" | "disagree" | "skip" | undefined;

interface YesNoQuestionProps {
  data: YesNoData;
  onResponse: (responseString: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function YesNoQuestion({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: YesNoQuestionProps) {
  const initialResponses: YesNoResponse[] =
    value?.kind === "yesno"
      ? value.responses
      : new Array(data.statements.length).fill(undefined);
  const [responses, setResponses] = useState<YesNoResponse[]>(initialResponses);

  const handleResponse = (
    index: number,
    response: "agree" | "disagree" | "skip",
  ) => {
    setResponses((prev) => {
      const next = [...prev];
      next[index] = response;
      return next;
    });
  };

  const handleSubmit = () => {
    const finalResponses = responses.map((r) => r || "skip");
    const formattedStatements = finalResponses
      .map((response, index) => {
        const item = data.statements[index];
        return `Statement ${index + 1}: "${item.statement}"${item.context ? ` (Context: "${item.context}")` : ""} - Response: ${response}`;
      })
      .join("\n");
    onResponse(`Yes/No Questions:\n${formattedStatements}`, {
      kind: "yesno",
      responses: finalResponses,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {data.statements.map((item, index) => (
        <Card key={item.statement} className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Statement {index + 1}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-base leading-relaxed">{item.statement}</p>
              {item.context && (
                <p className="text-sm text-muted-foreground mt-2">
                  {item.context}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => handleResponse(index, "agree")}
                disabled={disabled || locked}
                className="flex-1 h-12"
                variant={responses[index] === "agree" ? "default" : "outline"}
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                Agree
              </Button>

              <Button
                onClick={() => handleResponse(index, "disagree")}
                disabled={disabled || locked}
                className="flex-1 h-12"
                variant={
                  responses[index] === "disagree" ? "destructive" : "outline"
                }
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Disagree
              </Button>
            </div>

            <Button
              onClick={() => handleResponse(index, "skip")}
              disabled={disabled || locked}
              variant={responses[index] === "skip" ? "secondary" : "ghost"}
              className="w-full"
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Skip for now
            </Button>
          </CardContent>
        </Card>
      ))}

      {!locked && (
        <Button onClick={handleSubmit} disabled={disabled} variant="default">
          Submit
        </Button>
      )}
    </div>
  );
}
