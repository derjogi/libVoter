// Server-only prompt manager

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { type ElectionConfig, electionConfig } from "@/lib/config/election";
import {
  newTraceId,
  serializeError,
  summarizeForLog,
  withTimeout,
} from "@/lib/debug/logging";
import type { ChatModel } from "@/lib/server/ai/model-factory";
import { createChatModel } from "@/lib/server/ai/model-factory";
import { electionDataRepository } from "@/lib/server/election-data";
import type { ConversationMessage, UserResponse } from "@/types";
import { formatPrompt, getPrompt } from "./index";
import { mmpVotingGuidance } from "./mmp-guidance";
import { formatUserResponses } from "./user-response-format";

export interface PromptExecutionResult {
  success: boolean;
  response?: any;
  error?: string;
  metadata: {
    promptId: string;
    executionTime: number;
    tokensUsed?: number;
    model: string;
  };
}

export class PromptManager {
  private chatModel: ChatModel;
  private electionConfig: ElectionConfig;

  constructor(electionConfigParam: ElectionConfig = electionConfig) {
    this.chatModel = createChatModel(); // Defaults to small model. For now. Should probably be variable and specified in the prompt...?
    this.electionConfig = electionConfigParam;
  }

  /**
   * System message shared by every prompt this manager runs. For MMP elections
   * (spec 020) it appends the two-vote guidance so question generation and
   * component selection understand the party vote and electorate vote; for
   * non-MMP elections it is unchanged. Public so it can be unit-tested without
   * invoking the model.
   */
  buildSystemMessage(): string {
    const base = `You are a helpful AI assistant helping users discover their voting preferences for the ${this.electionConfig.year} ${this.electionConfig.type} in ${this.electionConfig.location}. Provide accurate, neutral responses focused on ${this.electionConfig.keyTopics.join(", ")}.`;
    const guidance = mmpVotingGuidance(this.electionConfig);
    return guidance ? `${base}\n\n${guidance}` : base;
  }

  async executePrompt(
    promptId: keyof typeof import("./index").PROMPTS,
    variables: Record<string, any>,
  ): Promise<PromptExecutionResult> {
    const traceId = newTraceId(`prompt:${promptId}`);
    const startTime = Date.now();
    const timeoutMs = Number.parseInt(
      process.env.AI_PROMPT_TIMEOUT_MS || "25000",
      10,
    );

    try {
      const template = getPrompt(promptId);

      // Only load the election-wide seat list for prompts that explicitly
      // declare it. COMPONENT_SELECTOR intentionally does not: the voter has
      // already selected their seat by then.
      const electionSeats = template.variables.includes("electionSeats")
        ? variables.electionSeats ||
          (await electionDataRepository.listSeats()).join(", ")
        : undefined;

      // Merge election variables into the provided variables.
      const electionVariables = {
        electionYear: this.electionConfig.year,
        electionType: this.electionConfig.type,
        electionLocation: this.electionConfig.location,
        electionKeyTopics: this.electionConfig.keyTopics.join(", "),
        electionDescription: this.electionConfig.description,
        electionSeatLabel: this.electionConfig.seatLabel,
        electionSeatLabelPlural: this.electionConfig.seatLabelPlural,
        electionVotingSystem: this.electionConfig.votingSystem,
        electionSeats,
      };

      const allVariables = { ...variables, ...electionVariables };
      const formatted = formatPrompt(template, allVariables);
      console.log(`[${traceId}] Calling prompt`, {
        promptId,
        model: this.chatModel.model,
        promptChars: formatted.content.length,
        variables: summarizeForLog(allVariables),
        timeoutMs,
      });
      console.time(`[${traceId}] Prompt Execution: ${promptId}`);
      const systemMessage = this.buildSystemMessage();
      const response = await withTimeout(
        this.chatModel.invoke([
          new SystemMessage({ content: systemMessage }),
          new HumanMessage({ content: formatted.content }),
        ]),
        timeoutMs,
        `Prompt ${promptId}`,
      );
      console.timeEnd(`[${traceId}] Prompt Execution: ${promptId}`);

      console.log(`[${traceId}] Prompt succeeded`, {
        promptId,
        responsePreview: summarizeForLog(response.content),
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        response: response.content,
        metadata: {
          promptId: template.id,
          executionTime,
          tokensUsed: this.estimateTokens(formatted.content + response.content),
          model: this.chatModel.model,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.timeEnd(`[${traceId}] Prompt Execution: ${promptId}`);

      console.error(`[${traceId}] Prompt execution failed`, {
        promptId,
        executionTime,
        model: this.chatModel.model,
        error: serializeError(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          promptId,
          executionTime,
          model: process.env.AI_MODEL_LARGE || "gpt-4",
        },
      };
    }
  }

  async generateNextQuestion(
    conversationHistory: ConversationMessage[],
    userResponses: UserResponse[],
    questionType: string = "chat",
  ): Promise<PromptExecutionResult> {
    const conversationText = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const preferences = this.extractPreferences(userResponses);

    return this.executePrompt("NEXT_QUESTION_GENERAL", {
      conversationHistory: conversationText,
      currentPreferences: preferences,
      questionType,
    });
  }

  async generateFollowupQuestion(
    lastResponse: string,
    context: string,
  ): Promise<PromptExecutionResult> {
    return this.executePrompt("FOLLOWUP_QUESTION", {
      lastResponse,
      context,
    });
  }

  async selectComponent(
    conversationState: string,
  ): Promise<PromptExecutionResult> {
    return this.executePrompt("COMPONENT_SELECTOR", {
      conversationState,
    });
  }

  async explainMatch(
    userProfile: string,
    candidateInfo: string,
    matchScore: number,
  ): Promise<PromptExecutionResult> {
    return this.executePrompt("EXPLAIN_MATCH", {
      userProfile,
      candidateInfo,
      matchScore,
    });
  }

  async summarizePreferences(
    allResponses: UserResponse[],
  ): Promise<PromptExecutionResult> {
    return this.executePrompt("SUMMARIZE_PREFERENCES", {
      allResponses: formatUserResponses(allResponses),
    });
  }

  private extractPreferences(responses: UserResponse[]): string {
    // Simple preference extraction - enhance with more sophisticated analysis
    const topics = new Set<string>();

    responses.forEach((response) => {
      const text = this.extractTextFromResponse(response);
      const lowerText = text.toLowerCase();

      // Extract common political topics
      const topicKeywords = [
        "economy",
        "healthcare",
        "education",
        "environment",
        "taxes",
        "immigration",
        "foreign policy",
        "social security",
      ];

      topicKeywords.forEach((topic) => {
        if (lowerText.includes(topic)) {
          topics.add(topic);
        }
      });
    });

    return (
      Array.from(topics).join(", ") || "No clear preferences identified yet"
    );
  }

  private extractTextFromResponse(response: UserResponse): string {
    if (typeof response.value === "string") return response.value;
    if (Array.isArray(response.value)) return response.value.join(" ");
    if (typeof response.value === "object")
      return JSON.stringify(response.value);
    return String(response.value || "");
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
let promptManager: PromptManager | null = null;

export function getPromptManager(): PromptManager {
  if (!promptManager) {
    promptManager = new PromptManager();
  }
  return promptManager;
}
