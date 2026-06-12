// Server-only AI chat processing
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { getAIConfig } from "./config";
import { createChatModel } from "./model-factory";
import { ConfidenceCalculator } from "./confidence-calculator";
import { explainCandidateMatch } from "@/lib/actions/prompts";
import { queryRAGContext } from "@/lib/actions/rag";
import { electionConfig } from "@/lib/config/election";
import {
  ComponentDataSchema,
  SAFE_FALLBACK_COMPONENT,
} from "@/types/components.zod";
import type {
  ConversationMessage,
  UserResponse,
  ComponentData,
  CandidateMatch,
  PolicyPosition,
} from "@/types";
import type { ChatModel } from "./model-factory";
import type { RAGContext } from "../rag/query-engine";
import type { Candidate } from "@/lib/db/schema";

// A single turn of advisor output. One structured LLM call now produces the
// conversational reply, the next UI component, and an optional follow-up chip —
// replacing the previous 2–3 separate calls per user message.
const ChatTurnSchema = z.object({
  message: z.string().describe("Conversational, neutral reply to the user"),
  nextComponent: ComponentDataSchema.describe(
    "The next UI component to render; its data must match the chosen type",
  ),
  followupQuestion: z
    .object({
      question: z.string(),
      type: z.string().optional(),
      reasoning: z.string().optional(),
    })
    .optional()
    .describe("Optional one-line follow-up suggestion the user can tap"),
});

type ChatTurn = z.infer<typeof ChatTurnSchema>;

export interface ChatResponse {
  message: string;
  confidence: number;
  shouldShowCandidates: boolean;
  nextComponent?: ComponentData;
  candidateMatches?: CandidateMatch[];
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}

export class AIChatHandler {
  private chatModel: ChatModel;

  constructor() {
    const config = getAIConfig();
    const modelConfig = config.models.small;

    this.chatModel = createChatModel(modelConfig);
  }

  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    userResponseHistory: UserResponse[],
    availableCandidates: Candidate[],
  ): Promise<ChatResponse> {
    try {
      // Confidence is computed deterministically — no LLM call needed.
      const confidenceResult = ConfidenceCalculator.calculate(
        userResponseHistory,
        conversationHistory,
      );

      // Available seats (electorates/wards) derived from the candidate list.
      const availableSeats = [
        ...new Set(availableCandidates.map((c) => c.ward)),
      ];

      // Static, cache-friendly preamble first; only the per-turn dynamic data
      // (confidence) goes in the final user message so the cached prefix stays
      // byte-stable across turns (OpenAI/OpenRouter automatic prefix caching,
      // Anthropic cache_control).
      const systemPreamble = this.buildSystemPreamble(availableSeats);

      const recentHistory = conversationHistory.slice(-10);
      const messages: (HumanMessage | AIMessage | SystemMessage)[] = [
        new SystemMessage({ content: systemPreamble }),
        ...recentHistory.map((h) =>
          h.role === "user"
            ? new HumanMessage({ content: h.content })
            : new AIMessage({ content: h.content }),
        ),
        new HumanMessage({
          content: `${userMessage}\n\n[advisor note — current confidence ${confidenceResult.score}/100: ${confidenceResult.reasoning}]`,
        }),
      ];

      // ONE structured call returns reply + next component (+ followup),
      // replacing the previous 2–3 separate LLM round-trips per turn.
      console.log("Processing message with combined structured AI call");
      const turn = await this.generateChatTurn(messages);
      console.log("Chat turn:", JSON.stringify(turn));

      const config = getAIConfig();
      const shouldShowCandidates =
        confidenceResult.score >= config.thresholds.confidence &&
        userResponseHistory.length >= config.thresholds.minInteractions;

      // Preserve previous UX: only surface a follow-up chip while confidence is
      // still low.
      const followupQuestion =
        confidenceResult.score < 70 && turn.followupQuestion
          ? {
              question: turn.followupQuestion.question,
              type: turn.followupQuestion.type ?? "chat",
              reasoning: turn.followupQuestion.reasoning,
            }
          : undefined;

      return {
        message: turn.message,
        confidence: confidenceResult.score,
        shouldShowCandidates,
        nextComponent: turn.nextComponent,
        // Candidate ranking lives in spec 005; return [] so the client keeps
        // its existing list rather than overwriting it.
        candidateMatches: [],
        followupQuestion,
      };
    } catch (error) {
      console.error("AI chat processing error:", error);
      throw new Error("Failed to process chat message");
    }
  }

  /**
   * Static instructions shared by every turn. Stable within a session so the
   * model provider can cache it as a prompt prefix.
   */
  private buildSystemPreamble(availableSeats: string[]): string {
    return `You are an AI voting advisor for the ${electionConfig.year} ${electionConfig.type} in ${electionConfig.location}.

Each turn you do two things:
1. Reply to the user conversationally — neutral, concise, and helpful.
2. Choose the single best next UI component to keep narrowing their political preferences, and generate its data.

Key topics: ${electionConfig.keyTopics.join(", ")}.
The voter's available ${electionConfig.seatLabelPlural}: ${availableSeats.join(", ") || "unknown"}.

Conversation discipline:
- Ask exactly one question per turn. Never bundle multiple independent questions into one component.
- After a multiselect answer, ask one focused follow-up about a single selected topic — not another broad multiselect (unless no priorities were chosen yet).
- Use multiselect only for broad discovery; dropdown to choose one priority; yesno for one or a few closely-related statements; slider for intensity/trade-offs; priority to rank options; freetext/chat when the user needs to add nuance or redirect.
- When unsure, prefer a focused dropdown, chat, yesno, or slider over a broad multiselect.
- Stay neutral and unbiased. Do not ask the user for candidate details — all candidate data is provided to you.

Output fields:
- message: your conversational reply.
- nextComponent: the next component; its "data" MUST match the chosen "type".
- followupQuestion: optional short suggestion chip the user can tap to continue.`;
  }

  /**
   * Single structured LLM call returning a validated chat turn. withStructuredOutput
   * constrains the model to ChatTurnSchema; on repeated failure it falls back to
   * a plain reply + safe chat component so the UI keeps working.
   */
  private async generateChatTurn(
    messages: (HumanMessage | AIMessage | SystemMessage)[],
  ): Promise<ChatTurn> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    // withStructuredOutput's typings differ across ChatOpenAI / ChatAnthropic /
    // the mock; the cast keeps the call site simple.
    const structured = (
      this.chatModel as unknown as {
        withStructuredOutput: (
          schema: unknown,
          config?: unknown,
        ) => { invoke: (m: unknown) => Promise<ChatTurn> };
      }
    ).withStructuredOutput(ChatTurnSchema, {
      name: "chat_turn",
      // jsonSchema (response_format) is the most broadly supported transport on
      // OpenRouter — many models (incl. the `:free` routes) reject tool/function
      // calling with a 400. See model-factory for the configured provider.
      method: "jsonSchema",
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const timerLabel = `Time for: AI Chat Turn Attempt ${attempt}`;
      console.time(timerLabel);
      try {
        const result = await structured.invoke(messages);
        return result;
      } catch (error) {
        console.error(`AI chat turn attempt ${attempt} failed:`, error);
        lastError = error as Error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      } finally {
        console.timeEnd(timerLabel);
      }
    }

    // Last-resort fallback: a plain reply with a safe chat component.
    console.error(
      "All structured chat-turn attempts failed, using fallback:",
      lastError,
    );
    try {
      const plain = await this.chatModel.invoke(messages);
      return {
        message:
          typeof plain.content === "string"
            ? plain.content
            : "Let's keep going — tell me more about what matters to you.",
        nextComponent: SAFE_FALLBACK_COMPONENT,
      };
    } catch {
      return {
        message: "Let's keep going — tell me more about what matters to you.",
        nextComponent: SAFE_FALLBACK_COMPONENT,
      };
    }
  }

  private async queryRAGContext(userMessage: string, userContext: string) {
    try {
      const result = await queryRAGContext(userMessage, userContext);
      if (result.success && result.data) {
        return result.data;
      } else {
        console.warn(
          "RAG query failed, falling back to database-only context:",
          result.error,
        );
        return {
          rankedCandidates: [],
          relevantPolicies: [],
          sources: [],
        };
      }
    } catch (error) {
      console.error("Error querying RAG context:", error);
      return {
        rankedCandidates: [],
        relevantPolicies: [],
        sources: [],
      };
    }
  }

  private filterAndTransformCandidates(
    ids: string[],
    candidates: Candidate[],
  ): CandidateMatch[] {
    // Filter candidates based on RAG-ranked IDs
    const filteredCandidates = candidates.filter((candidate) =>
      ids.includes(candidate.id.toString()),
    );

    // Transform to CandidateMatch format
    return filteredCandidates.map((candidate) => ({
      candidate,
      score: 75, // Default score for RAG-fetched candidates
      reasoning: "Identified through semantic search",
      pros: [],
      cons: [],
      topMatchingPolicies: this.extractTopPolicies(candidate),
      sources: [],
    }));
  }

  private formatRAGContext(
    ragContext: RAGContext,
    existingCandidates: CandidateMatch[],
    ragCandidates: CandidateMatch[],
  ): string {
    if (
      !ragContext ||
      (!ragContext.relevantPolicies?.length &&
        !ragContext.sources?.length &&
        !ragContext.rankedCandidates?.length)
    ) {
      return "";
    }

    let ragInfo = "\n\nAdditional context from knowledge base:";

    // Add semantically ranked candidates that aren't already in structured data
    if (ragContext.rankedCandidates?.length > 0) {
      const existingCandidateIds = new Set(
        existingCandidates.map((c) => c.candidate.id),
      );

      const ragCandidateMap = new Map(
        ragCandidates.map((c) => [c.candidate.id, c.candidate]),
      );

      const newRankedCandidates = ragContext.rankedCandidates.filter(
        (rc) =>
          !existingCandidateIds.has(parseInt(rc.candidateId)) &&
          ragCandidateMap.has(parseInt(rc.candidateId)),
      );

      if (newRankedCandidates.length > 0) {
        ragInfo += "\nSemantically relevant candidates:";
        newRankedCandidates.slice(0, 3).forEach((rankedCandidate, index) => {
          const candidate = ragCandidateMap.get(
            parseInt(rankedCandidate.candidateId),
          );
          if (candidate) {
            const relevancePercent = Math.round(
              rankedCandidate.relevanceScore * 100,
            );
            ragInfo += `\n${index + 1}. ${candidate.name} (${candidate.party}) - ${relevancePercent}% relevance`;
            if (rankedCandidate.matchedContent) {
              const preview = rankedCandidate.matchedContent.substring(0, 80);
              ragInfo += ` - "${preview}..."`;
            }
          }
        });
      }
    }

    // Add relevant policies that aren't already covered in structured data
    if (ragContext.relevantPolicies?.length > 0) {
      const existingPolicyTopics = new Set(
        existingCandidates
          .flatMap((c) => c.topMatchingPolicies || [])
          .map((p: string) => p.toLowerCase()),
      );

      const newPolicies = ragContext.relevantPolicies.filter(
        (policy: PolicyPosition) =>
          !existingPolicyTopics.has(policy.topic?.toLowerCase()),
      );

      if (newPolicies.length > 0) {
        ragInfo += "\nRelevant policy positions:";
        newPolicies.slice(0, 3).forEach((policy: any) => {
          const details = policy.details
            ? policy.details
            : "No details available";
          ragInfo += `\n- ${policy.topic}: ${policy.stance} - ${details}...`;
        });
      }
    }

    // Add sources if available
    if (ragContext.sources?.length > 0) {
      ragInfo += "\nSources: " + ragContext.sources.slice(0, 3).join(", ");
    }

    return ragInfo;
  }

  private async generateCandidateMatches(
    userResponses: UserResponse[],
    availableCandidates: Candidate[],
  ): Promise<CandidateMatch[]> {
    // Create user profile summary from responses
    const userProfile = this.createUserProfileSummary(userResponses);

    try {
      const candidates: Candidate[] = availableCandidates;
      if (candidates.length === 0) {
        console.warn("No candidates found for matching");
        return [];
      }

      // Transform database records to match format and generate explanations
      const matchesWithExplanations = await Promise.all(
        candidates.map(async (candidate) => {
          // Create info summary from candidate data
          const info = this.createCandidateInfoSummary(candidate);

          // Generate a simple score (in production, use more sophisticated matching)
          const score = this.calculateCandidateScore(candidate, userResponses);

          let explanationResult = {
            success: true,
            data: "Too many candidates to fetch detailed explanation. Please narrow down candidate selection more to generate match explanations.",
          };
          if (candidates.length <= 3) {
            // Generate explanation
            explanationResult = await explainCandidateMatch(
              userProfile,
              info,
              score,
            );
          }

          // Extract top policies from candidate data
          const topPolicies = this.extractTopPolicies(candidate);

          return {
            candidate,
            score,
            reasoning: explanationResult.success
              ? explanationResult.data
              : "Unable to generate explanation",
            pros: [],
            cons: [],
            topMatchingPolicies: topPolicies,
            sources: [],
          };
        }),
      );

      return matchesWithExplanations;
    } catch (error) {
      console.error("Error generating candidate matches:", error);
      return [];
    }
  }

  private createUserProfileSummary(userResponses: UserResponse[]): string {
    // Create a simple summary of user preferences from responses
    const responsesText = userResponses
      .map((r) => `${r.questionId}: ${this.extractTextFromResponse(r)}`)
      .join("\n");

    return `User responses summary:\n${responsesText}`;
  }

  private extractTextFromResponse(response: UserResponse): string {
    if (typeof response.value === "string") return response.value;
    if (Array.isArray(response.value)) return response.value.join(", ");
    if (typeof response.value === "object")
      return JSON.stringify(response.value);
    return String(response.value || "");
  }

  private createCandidateInfoSummary(candidate: any): string {
    const parts = [];

    if (candidate.candidate_statement) {
      parts.push(candidate.candidate_statement);
    }

    if (candidate.why) {
      parts.push(`Why running: ${candidate.why}`);
    }

    if (candidate.key_skills) {
      parts.push(`Key skills: ${candidate.key_skills}`);
    }

    if (candidate.top_issues) {
      parts.push(`Top issues: ${candidate.top_issues}`);
    }

    if (
      candidate.key_positions &&
      typeof candidate.key_positions === "object"
    ) {
      const positions = Object.entries(candidate.key_positions)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      parts.push(`Key positions: ${positions}`);
    }

    return parts.join(". ") || "No detailed information available.";
  }

  private calculateCandidateScore(
    candidate: any,
    userResponses: UserResponse[],
  ): number {
    // Simple scoring mechanism - in production, use more sophisticated matching
    // For now, return a score between 60-90 based on some basic heuristics

    let baseScore = 75; // Default score

    // Boost score if candidate has detailed information
    if (candidate.candidate_statement) baseScore += 5;
    if (candidate.key_positions) baseScore += 5;
    if (candidate.top_issues) baseScore += 5;

    // Add some randomness to simulate different matches
    const randomVariation = Math.floor(Math.random() * 20) - 10; // -10 to +10
    baseScore += randomVariation;

    // Ensure score is within reasonable bounds
    return Math.max(50, Math.min(95, baseScore));
  }

  private extractTopPolicies(candidate: any): string[] {
    const policies: string[] = [];

    // Extract from key_positions if available
    if (
      candidate.key_positions &&
      typeof candidate.key_positions === "object"
    ) {
      const positions = Object.keys(candidate.key_positions);
      policies.push(...positions.slice(0, 3)); // Take up to 3
    }

    // Extract from top_issues if available
    if (candidate.top_issues && policies.length < 3) {
      const issues = candidate.top_issues
        .split(",")
        .map((s: string) => s.trim());
      policies.push(...issues.slice(0, 3 - policies.length));
    }

    return policies.slice(0, 3); // Ensure max 3 policies
  }
}
