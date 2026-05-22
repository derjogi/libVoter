"use client";

import { useCallback, useState } from "react";
import { processChatMessage } from "@/lib/actions/chat";
import type { Candidate } from "@/lib/db/schema";
import type { ChatResponse } from "@/lib/server/ai/chat-handler";
import type { ConversationMessage, UserResponse } from "@/types";
import { usePersistedState } from "./usePersistedState";

export function useChat() {
  const [messages, setMessages, , clearStoredMessages] = usePersistedState<
    ConversationMessage[]
  >("chat:messages", []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence, , clearStoredConfidence] =
    usePersistedState<number>("chat:confidence", 0);
  const [
    shouldShowCandidates,
    setShouldShowCandidates,
    ,
    clearStoredShouldShow,
  ] = usePersistedState<boolean>("chat:shouldShowCandidates", false);
  const [followupQuestion, setFollowupQuestion, , clearStoredFollowup] =
    usePersistedState<ChatResponse["followupQuestion"]>(
      "chat:followupQuestion",
      undefined,
    );

  const sendMessage = useCallback(
    async (
      message: string,
      userResponseHistory: UserResponse[],
      availableCandidates: Candidate[],
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        // Add user message to history
        const userMessage: ConversationMessage = {
          id: `msg_${Date.now()}`,
          role: "user",
          content: message,
          timestamp: new Date(),
        };

        // Build the latest history synchronously, then both update state and
        // hand it to the server action. Using the functional setter avoids a
        // stale closure if `messages` hasn't flushed yet.
        let updatedHistory: ConversationMessage[] = [];
        setMessages((prev) => {
          updatedHistory = [...prev, userMessage];
          return updatedHistory;
        });

        // Process with AI
        const result = await processChatMessage(
          message,
          updatedHistory,
          userResponseHistory || [],
          availableCandidates,
        );

        if (!result) {
          throw new Error("No response from server");
        }

        // Add AI response to history
        const aiMessage: ConversationMessage = {
          id: `msg_${Date.now() + 1}`,
          role: "assistant",
          content: result.message,
          timestamp: new Date(),
          componentData: result.nextComponent,
        };

        setMessages((prev) => [...prev, aiMessage]);
        setConfidence(result.confidence);
        setShouldShowCandidates(result.shouldShowCandidates);
        setFollowupQuestion(result.followupQuestion);

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Chat error:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [setMessages, setConfidence, setShouldShowCandidates, setFollowupQuestion],
  );

  const clearChat = useCallback(() => {
    clearStoredMessages();
    clearStoredConfidence();
    clearStoredShouldShow();
    clearStoredFollowup();
    setError(null);
  }, [
    clearStoredMessages,
    clearStoredConfidence,
    clearStoredShouldShow,
    clearStoredFollowup,
  ]);

  return {
    messages,
    isLoading,
    error,
    confidence,
    shouldShowCandidates,
    followupQuestion,
    sendMessage,
    clearChat,
  };
}
