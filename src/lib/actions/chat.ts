"use server";

import { newTraceId } from "@/lib/debug/logging";
import {
  AIChatHandler,
  type ChatResponse,
  type RankingResponse,
} from "@/lib/server/ai/chat-handler";
import {
  type NextQuestionContext,
  nextQuestionContextSchema,
} from "@/lib/server/voter-claims/next-question-context";
import type { Candidate, PartySummary, UserResponse } from "@/types";

let chatHandler: AIChatHandler | null = null;

function getChatHandler() {
  if (!chatHandler) {
    chatHandler = new AIChatHandler();
  }
  return chatHandler;
}

export async function processChatMessage(
  context: NextQuestionContext,
  availableCandidates: Candidate[],
): Promise<ChatResponse> {
  const traceId = newTraceId("action:processChatMessage");
  const start = Date.now();
  console.log(`[${traceId}] start`, {
    acceptedClaims: context.acceptedClaims.length,
    askedCoverage: context.askedCoverage.length,
    availableCandidates: availableCandidates.length,
  });

  try {
    const validatedContext = nextQuestionContextSchema.parse(context);
    const handler = getChatHandler();
    const response = await handler.processMessage(
      validatedContext,
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
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      message:
        "I apologize, but I encountered an error processing your message. Please try again.",
      confidence: 0,
      shouldShowCandidates: false,
    };
  }
}

/**
 * RAG-backed candidate ranking, split out of {@link processChatMessage} so the
 * client can render the next question immediately and fill in the candidate
 * panel when this resolves. Never throws — returns an empty, non-gating result
 * on failure so the client keeps its current (unranked) list.
 */
export async function rankCandidatesForSession(
  userResponseHistory: UserResponse[],
  availableCandidates: Candidate[],
  availableParties: PartySummary[] = [],
): Promise<RankingResponse> {
  const traceId = newTraceId("action:rankCandidates");
  const start = Date.now();
  console.log(`[${traceId}] start`, {
    userResponses: userResponseHistory.length,
    availableCandidates: availableCandidates.length,
    availableParties: availableParties.length,
  });

  try {
    const handler = getChatHandler();
    const response = await handler.rankResponses(
      userResponseHistory,
      availableCandidates,
      availableParties,
    );

    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      confidence: response.confidence,
      shouldShowCandidates: response.shouldShowCandidates,
      candidateMatches: response.candidateMatches.length,
      partyMatches: response.partyMatches.length,
    });
    return response;
  } catch (error) {
    console.error(`[${traceId}] failed`, {
      elapsedMs: Date.now() - start,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      candidateMatches: [],
      partyMatches: [],
      confidence: 0,
      shouldShowCandidates: false,
    };
  }
}
