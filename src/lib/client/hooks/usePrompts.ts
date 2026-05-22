"use client";

import { useState } from "react";
import { explainCandidateMatch } from "@/lib/actions/prompts";

export function usePromptActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuestion = async (
    conversationHistory: any[],
    userResponses: any[],
    questionType: string = "chat",
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/prompts/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationHistory,
          userResponses,
          questionType,
        }),
      });

      const result = await response.json();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const explainMatch = async (
    userProfile: string,
    candidateInfo: string,
    matchScore: number,
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await explainCandidateMatch(
        userProfile,
        candidateInfo,
        matchScore,
      );
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    generateQuestion,
    explainMatch,
    loading,
    error,
  };
}
