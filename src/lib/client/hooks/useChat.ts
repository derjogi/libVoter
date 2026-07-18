"use client";

import { useCallback, useRef, useState } from "react";
import { processChatMessage } from "@/lib/actions/chat";
import { newTraceId } from "@/lib/debug/logging";
import type { ChatResponse } from "@/lib/server/ai/chat-handler";
import type { NextQuestionContext } from "@/lib/server/voter-claims/next-question-context";
import type { Candidate } from "@/types";

export function useChat() {
  const requestEpochRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [shouldShowCandidates, setShouldShowCandidates] = useState(false);
  const [followupQuestion, setFollowupQuestion] =
    useState<ChatResponse["followupQuestion"]>();
  const [voteLane, setVoteLane] = useState<ChatResponse["voteLane"]>();

  const sendMessage = useCallback(
    async (context: NextQuestionContext, availableCandidates: Candidate[]) => {
      const requestEpoch = ++requestEpochRef.current;
      const traceId = newTraceId("ui:sendMessage");
      const start = Date.now();
      console.log(`[${traceId}] start`, {
        acceptedClaims: context.acceptedClaims.length,
        askedCoverage: context.askedCoverage.length,
        availableCandidates: availableCandidates.length,
      });
      setIsLoading(true);
      setError(null);

      try {
        const result = await processChatMessage(context, availableCandidates);
        if (!result) throw new Error("No response from server");

        if (requestEpoch === requestEpochRef.current) {
          setConfidence(result.confidence);
          setShouldShowCandidates(result.shouldShowCandidates);
          setFollowupQuestion(result.followupQuestion);
          setVoteLane(result.voteLane);
        }
        console.log(`[${traceId}] done`, {
          elapsedMs: Date.now() - start,
          confidence: result.confidence,
          componentType: result.nextComponent?.type,
        });
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        if (requestEpoch === requestEpochRef.current) setError(errorMessage);
        console.error(`[${traceId}] failed`, {
          elapsedMs: Date.now() - start,
        });
        throw err;
      } finally {
        if (requestEpoch === requestEpochRef.current) setIsLoading(false);
      }
    },
    [],
  );

  const clearChat = useCallback(() => {
    requestEpochRef.current += 1;
    setIsLoading(false);
    setConfidence(0);
    setShouldShowCandidates(false);
    setFollowupQuestion(undefined);
    setVoteLane(undefined);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    confidence,
    shouldShowCandidates,
    followupQuestion,
    voteLane,
    sendMessage,
    clearChat,
  };
}
