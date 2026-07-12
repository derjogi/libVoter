"use server";

import { newTraceId, serializeError } from "@/lib/debug/logging";
import { getPromptManager } from "@/lib/server/prompts/prompt-manager";
import type { ConversationMessage, UserResponse } from "@/types";
import {
  parseComponentSpec,
  parseQuestionResponse,
  SAFE_FALLBACK_COMPONENT,
} from "@/types/components.zod";

export async function generateNextQuestion(
  conversationHistory: ConversationMessage[],
  userResponses: UserResponse[],
  questionType: string = "chat",
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateNextQuestion(
      conversationHistory,
      userResponses,
      questionType,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: "What are your thoughts on current political issues?",
          type: "chat",
          context: "General political discussion",
        },
      };
    }

    const validated = parseQuestionResponse(result.response);
    if (validated) {
      return { success: true, data: validated, metadata: result.metadata };
    }

    // Couldn't parse / validate. Treat the raw response as a chat question.
    console.warn(
      "generateNextQuestion: invalid LLM JSON, falling back to raw text",
    );
    return {
      success: false,
      error: "Failed to validate AI response",
      fallback: {
        question:
          typeof result.response === "string"
            ? result.response
            : "Tell me more about your views.",
        type: questionType,
        context: "AI-generated question (validation failed)",
      },
    };
  } catch (error) {
    console.error("Question generation failed:", error);
    return {
      success: false,
      error: "Failed to generate question",
      fallback: {
        question: "What political topics interest you most?",
        type: "chat",
        context: "Fallback question",
      },
    };
  }
}

export async function generateFollowupQuestion(
  lastResponse: string,
  context: string,
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateFollowupQuestion(
      lastResponse,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: "Can you tell me more about that?",
          type: "chat",
          reasoning: "Follow-up to previous response",
        },
      };
    }

    const validated = parseQuestionResponse(result.response);
    if (validated) {
      return { success: true, data: validated, metadata: result.metadata };
    }

    console.warn(
      "generateFollowupQuestion: invalid LLM JSON, falling back to raw text",
    );
    return {
      success: false,
      error: "Failed to validate followup response",
      fallback: {
        question:
          typeof result.response === "string"
            ? result.response
            : "Can you elaborate on your previous answer?",
        type: "chat",
        reasoning: "AI-generated followup (validation failed)",
      },
    };
  } catch (error) {
    console.error("Followup generation failed:", error);
    return {
      success: false,
      error: "Failed to generate followup",
      fallback: {
        question: "Can you elaborate on your previous answer?",
        type: "chat",
        reasoning: "Fallback followup",
      },
    };
  }
}

export async function selectNextComponent(conversationState: string) {
  const traceId = newTraceId("action:selectNextComponent");
  const start = Date.now();
  console.log(`[${traceId}] start`, {
    conversationStateChars: conversationState.length,
  });

  try {
    const manager = getPromptManager();
    const result = await manager.selectComponent(conversationState);

    if (!result.success) {
      console.warn(`[${traceId}] prompt failed; returning fallback`, {
        elapsedMs: Date.now() - start,
        error: result.error,
      });
      return {
        success: true,
        data: SAFE_FALLBACK_COMPONENT,
        validationFailed: true,
        error: result.error,
      };
    }

    const { spec, ok, error } = parseComponentSpec(result.response);
    console.log(`[${traceId}] done`, {
      elapsedMs: Date.now() - start,
      componentType: spec.type,
      validationFailed: !ok,
      error,
    });
    return {
      success: true,
      data: spec,
      validationFailed: !ok,
      error: ok ? undefined : error,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error(`[${traceId}] action crashed`, {
      elapsedMs: Date.now() - start,
      error: serializeError(error),
    });
    return {
      success: true,
      data: SAFE_FALLBACK_COMPONENT,
      validationFailed: true,
      error: "Failed to select component",
    };
  }
}

export async function explainCandidateMatch(
  userProfile: string,
  candidateInfo: string,
  matchScore: number,
) {
  try {
    const manager = getPromptManager();
    console.log("Explaining Match...");
    const result = await manager.explainMatch(
      userProfile,
      candidateInfo,
      matchScore,
    );

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error("Match explanation failed:", error);
    return {
      success: false,
      error: "Failed to generate explanation",
      data: "This candidate appears to align with your stated preferences.",
    };
  }
}

export async function summarizeUserPreferences(userResponses: UserResponse[]) {
  try {
    const manager = getPromptManager();
    const result = await manager.summarizePreferences(userResponses);

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error("Preference summarization failed:", error);
    return {
      success: false,
      error: "Failed to summarize preferences",
      data: "Based on your responses, you have shown interest in various political topics.",
    };
  }
}
