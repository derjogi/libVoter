"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, SkipForward } from "lucide-react";
import type { YesNoData } from "@/types";

interface YesNoQuestionProps {
  data: YesNoData;
  onResponse: (responseString: string) => void;
  disabled?: boolean;
}

export function YesNoQuestion({
  data,
  onResponse,
  disabled = false,
}: YesNoQuestionProps) {
  const [responses, setResponses] = useState<
    ("agree" | "disagree" | "skip" | undefined)[]
  >(new Array(data.statements.length).fill(undefined));

  const handleResponse = (
    index: number,
    response: "agree" | "disagree" | "skip",
  ) => {
    console.log(`Clicked ${response} on ${data.statements[index]}`);
    setResponses((prev) => {
      const newResponses = [...prev];
      newResponses[index] = response;
      return newResponses;
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
    const responseString = `Yes/No Questions:\n${formattedStatements}`;
    onResponse(responseString);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto h-full flex flex-col min-h-0">
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4 p-4">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {data.statements.map((item, index) => (
            <Card key={index} className="w-full">
              <CardHeader>
                <CardTitle className="text-lg">Statement {index + 1}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
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
                    className="flex-1 h-12"
                    variant={
                      responses[index] === "agree" ? "default" : "outline"
                    }
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Agree
                  </Button>

                  <Button
                    onClick={() => handleResponse(index, "disagree")}
                    className="flex-1 h-12"
                    variant={
                      responses[index] === "disagree"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Disagree
                  </Button>
                </div>

                <Button
                  onClick={() => handleResponse(index, "skip")}
                  variant={responses[index] === "skip" ? "secondary" : "ghost"}
                  className="w-full"
                >
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip for now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full"
          variant="default"
        >
          Submit
        </Button>
      </CardContent>
    </Card>
  );
}
