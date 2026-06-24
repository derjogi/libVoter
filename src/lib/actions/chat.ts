"use server";

import type { Candidate } from "@/lib/db/schema";
import { newTraceId, serializeError } from "@/lib/debug/logging";
import { AIChatHandler, type ChatResponse } from "@/lib/server/ai/chat-handler";
import type { ConversationMessage, UserResponse } from "@/types";

let chatHandler: AIChatHandler | null = null;

function getChatHandler() {
  if (!chatHandler) {
    chatHandler = new AIChatHandler();
  }
  return chatHandler;
}

export async function processChatMessage(
  message: string,
  conversationHistory: ConversationMessage[],
  userResponseHistory: UserResponse[],
  availableCandidates: Candidate[],
): Promise<ChatResponse> {
  const traceId = newTraceId("action:processChatMessage");
  const start = Date.now();
  console.log(`[${traceId}] start`, {
    messageChars: message.length,
    conversationHistory: conversationHistory.length,
    userResponses: userResponseHistory.length,
    availableCandidates: availableCandidates.length,
  });

  try {
    const handler = getChatHandler();
    const response = await handler.processMessage(
      message,
      conversationHistory,
      userResponseHistory,
      availableCandidates,
    );

    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      confidence: response.confidence,
      shouldShowCandidates: response.shouldShowCandidates,
      candidateMatches: response.candidateMatches?.length ?? 0,
    });
    return response;
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return {
      message:
        "I apologize, but I encountered an error processing your message. Please try again.",
      confidence: 0,
      shouldShowCandidates: false,
    };
  }
}
