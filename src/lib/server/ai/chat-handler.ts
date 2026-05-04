// Server-only AI chat processing
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIConfig } from './config';
import { createChatModel } from './model-factory';
import { ConfidenceCalculator } from './confidence-calculator';
import { selectNextComponent, explainCandidateMatch, generateFollowupQuestion } from '@/lib/actions/prompts';
import { getUniqueWards, getCandidatesByWard, getMayorCandidates, getCandidatesByIds } from '@/lib/actions/database';
import { queryRAGContext } from '@/lib/actions/rag';
import { electionConfig } from '@/lib/config/election';
import type { ConversationMessage, UserResponse, ComponentData, CandidateMatch, PolicyPosition } from '@/types';
import type { ChatModel } from './model-factory';
import type { RAGContext } from '../rag/query-engine';
import type { Candidate } from '@/lib/db/schema';

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
    availableCandidates: Candidate[]
  ): Promise<ChatResponse> {
    try {
      // Calculate current confidence
      const confidenceResult = ConfidenceCalculator.calculate(
        userResponseHistory,
        conversationHistory
      );

      // Calculate available seats (electorates/wards) from available candidates
      const availableSeats = [...new Set(availableCandidates.map(c => c.ward))];

      // Build a minimal conversation context (no RAG yet — see spec 005)
      const systemPrompt = `You are an AI political advisor helping users discover their voting preferences for the ${electionConfig.year} ${electionConfig.type} in ${electionConfig.location}.
Current confidence level: ${confidenceResult.score}/100
Reasoning: ${confidenceResult.reasoning}

Be conversational, neutral, and helpful. Ask follow-up questions to understand their views better.
Focus on policy topics including ${electionConfig.keyTopics.join(', ')} and candidate positions.
Do not ask the user for candidate information or details about specific candidates, as all relevant candidate data is provided in the context.`;

      const recentHistory = conversationHistory.slice(-10);
      const messages: (HumanMessage | AIMessage | SystemMessage)[] = [
        new SystemMessage(systemPrompt),
        ...recentHistory.map(h =>
          h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content)
        ),
        new HumanMessage(userMessage),
      ];

      // Candidate ranking will move to spec 005; for now return [] so the client
      // keeps using its existing list rather than overwriting it.
      const candidates: CandidateMatch[] = [];

      // Get AI response with validation
      console.log(`Processing message with AI model`);
      const responseText = await this.getValidatedAIResponse(messages);
      console.log('AI response:', responseText);
      // Determine next component based on context
      const nextComponent = await this.determineNextComponent(
        userMessage,
        responseText,
        confidenceResult,
        conversationHistory,
        userResponseHistory,
        availableSeats
      );
      console.log('Next component:', JSON.stringify(nextComponent));
      // Check if we should show candidates
      const config = getAIConfig();
      const shouldShowCandidates =
        confidenceResult.score >= config.thresholds.confidence &&
        userResponseHistory.length >= config.thresholds.minInteractions;

      // Generate followup question if confidence is low
      let followupQuestion;
      if (confidenceResult.score < 70) {
        try {
          const context = `AI Response: ${responseText}\nConfidence: ${confidenceResult.score}/100\nReasoning: ${confidenceResult.reasoning}`;
          const followupResult = await generateFollowupQuestion(userMessage, context, availableSeats);
          if (followupResult.success && followupResult.data) {
            followupQuestion = {
              question: followupResult.data.question,
              type: followupResult.data.type ?? 'chat',
              reasoning: followupResult.data.reasoning
            };
          }
        } catch (error) {
          console.error('Failed to generate followup question:', error);
        }
      }

      return {
        message: responseText,
        confidence: confidenceResult.score,
        shouldShowCandidates,
        nextComponent,
        candidateMatches: candidates,
        followupQuestion
      };

    } catch (error) {
      console.error('AI chat processing error:', error);
      throw new Error('Failed to process chat message');
    }
  }

  private async getValidatedAIResponse(messages: (HumanMessage | AIMessage | SystemMessage)[]): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`getValidatedAIResponse: \n`, messages);
        console.time(`Time for: AI Chat Invoke Attempt ${attempt}`);
        const aiResponse = await this.chatModel.invoke(messages);
        // const aiResponse = {content: "Test fake value from AIChatHandler"}
        console.timeEnd(`Time for: AI Chat Invoke Attempt ${attempt}`);
        const responseText = aiResponse.content as string;
        return responseText;
      } catch (error) {
        console.error(`AI request attempt ${attempt} failed:`, error);
        lastError = error as Error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
    }

    // If all retries failed, return a fallback response
    console.error('All AI request attempts failed, using fallback');
    throw lastError || new Error('Failed to get AI response after retries');
  }

  private async queryRAGContext(userMessage: string, userContext: string) {
    try {
      const result = await queryRAGContext(userMessage, userContext);
      if (result.success && result.data) {
        return result.data;
      } else {
        console.warn('RAG query failed, falling back to database-only context:', result.error);
        return {
          rankedCandidates: [],
          relevantPolicies: [],
          sources: []
        };
      }
    } catch (error) {
      console.error('Error querying RAG context:', error);
      return {
        rankedCandidates: [],
        relevantPolicies: [],
        sources: []
      };
    }
  }

  private filterAndTransformCandidates(ids: string[], candidates: Candidate[]): CandidateMatch[] {
    // Filter candidates based on RAG-ranked IDs
    const filteredCandidates = candidates.filter(candidate =>
      ids.includes(candidate.id.toString())
    );

    // Transform to CandidateMatch format
    return filteredCandidates.map(candidate => ({
      candidate,
      score: 75, // Default score for RAG-fetched candidates
      reasoning: 'Identified through semantic search',
      pros: [],
      cons: [],
      topMatchingPolicies: this.extractTopPolicies(candidate),
      sources: []
    }));
  }

  private formatRAGContext(ragContext: RAGContext, existingCandidates: CandidateMatch[], ragCandidates: CandidateMatch[]): string {
    if (!ragContext || (!ragContext.relevantPolicies?.length && !ragContext.sources?.length && !ragContext.rankedCandidates?.length)) {
      return '';
    }

    let ragInfo = '\n\nAdditional context from knowledge base:';

    // Add semantically ranked candidates that aren't already in structured data
    if (ragContext.rankedCandidates?.length > 0) {
      const existingCandidateIds = new Set(
        existingCandidates.map(c => c.candidate.id)
      );

      const ragCandidateMap = new Map(
        ragCandidates.map(c => [c.candidate.id, c.candidate])
      );

      const newRankedCandidates = ragContext.rankedCandidates.filter(rc =>
        !existingCandidateIds.has(parseInt(rc.candidateId)) && ragCandidateMap.has(parseInt(rc.candidateId))
      );

      if (newRankedCandidates.length > 0) {
        ragInfo += '\nSemantically relevant candidates:';
        newRankedCandidates.slice(0, 3).forEach((rankedCandidate, index) => {
          const candidate = ragCandidateMap.get(parseInt(rankedCandidate.candidateId));
          if (candidate) {
            const relevancePercent = Math.round(rankedCandidate.relevanceScore * 100);
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
        existingCandidates.flatMap(c => c.topMatchingPolicies || []).map((p: string) => p.toLowerCase())
      );

      const newPolicies = ragContext.relevantPolicies.filter((policy: PolicyPosition) =>
        !existingPolicyTopics.has(policy.topic?.toLowerCase())
      );

      if (newPolicies.length > 0) {
        ragInfo += '\nRelevant policy positions:';
        newPolicies.slice(0, 3).forEach((policy: any) => {
          const details = policy.details ? policy.details : 'No details available';
          ragInfo += `\n- ${policy.topic}: ${policy.stance} - ${details}...`;
        });
      }
    }

    // Add sources if available
    if (ragContext.sources?.length > 0) {
      ragInfo += '\nSources: ' + ragContext.sources.slice(0, 3).join(', ');
    }

    return ragInfo;
  }

  private async determineNextComponent(
    userMessage: string,
    aiResponse: string,
    confidence: { score: number; reasoning: string },
    history: ConversationMessage[],
    userResponses: UserResponse[],
    availableSeats: string[]
  ): Promise<ComponentData | undefined> {
    const config = getAIConfig();

    // If confidence is low, continue with chat
    if (confidence.score < config.thresholds.confidence) {
      return {
        type: 'chat',
        data: {
          messages: [],
          placeholder: 'Tell me more about your views...'
        }
      };
    }

    // Create conversation state for the existing prompt system
    const recentHistory = history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n');
    const conversationState = `
Current confidence: ${confidence.score}/100
Reasoning: ${confidence.reasoning}

Recent conversation:
${recentHistory}

Latest user message: "${userMessage}"
AI response: "${aiResponse}"

Please select the next component that will best help narrow down the user's political preferences.`;

    try {
      console.log('Calling selectNextComponent with conversation state');
      const result = await selectNextComponent(conversationState, availableSeats);

      if (result.success && result.data) {
        console.log('Component selection result:', result.data);

        // Convert the result to ComponentData format
        const componentData: ComponentData = {
          type: result.data.component,
          data: result.data.data
        };

        return componentData;
      } else {
        console.warn('Component selection failed:', result.error);
      }
    } catch (error) {
      console.error('Error calling selectNextComponent:', error);
    }

    // Fallback to simple logic
    const lastComponents = history.slice(-3).map(h => h.componentData?.type).filter(Boolean);

    // Check if ward has been selected
    if (!userResponses.some(r => r.questionId === 'ward_selection')) {
      if (availableSeats.length > 0) {
        const options = availableSeats.map(seat => ({ id: seat, label: seat, description: '' }));
        return {
          type: 'multiselect',
          data: {
            question: `Which ${electionConfig.seatLabel} do you live in?`,
            options,
            maxSelections: 1,
            questionId: 'ward_selection',
          },
        };
      }
    }

    if (!lastComponents.includes('multiselect')) {
      return {
        type: 'multiselect',
        data: {
          question: 'Which of these issues matter most to you?',
          options: [
            { id: 'economy', label: 'Economy & Jobs', description: 'Economic policy and employment' },
            { id: 'healthcare', label: 'Healthcare', description: 'Medical care and health policy' },
            { id: 'education', label: 'Education', description: 'Schools and learning opportunities' },
            { id: 'environment', label: 'Environment', description: 'Climate change and conservation' }
          ],
          maxSelections: 3
        }
      };
    }

    // Default to chat
    return {
      type: 'chat',
      data: {
        messages: [],
        placeholder: 'What else would you like to know?'
      }
    };
  }


  private async generateCandidateMatches(userResponses: UserResponse[], availableCandidates: Candidate[]): Promise<CandidateMatch[]> {
    // Create user profile summary from responses
    const userProfile = this.createUserProfileSummary(userResponses);

    try {
      const candidates: Candidate[] = availableCandidates;
      if (candidates.length === 0) {
        console.warn('No candidates found for matching');
        return [];
      }

      // Transform database records to match format and generate explanations
      const matchesWithExplanations = await Promise.all(
        candidates.map(async (candidate) => {
          // Create info summary from candidate data
          const info = this.createCandidateInfoSummary(candidate);

          // Generate a simple score (in production, use more sophisticated matching)
          const score = this.calculateCandidateScore(candidate, userResponses);

          let explanationResult = {success: true, data: "Too many candidates to fetch detailed explanation. Please narrow down candidate selection more to generate match explanations."};
          if (candidates.length <= 3) {
            // Generate explanation
            explanationResult = await explainCandidateMatch(
              userProfile,
              info,
              score
            );
          }

          // Extract top policies from candidate data
          const topPolicies = this.extractTopPolicies(candidate);

          return {
            candidate,
            score,
            reasoning: explanationResult.success ? explanationResult.data : 'Unable to generate explanation',
            pros: [],
            cons: [],
            topMatchingPolicies: topPolicies,
            sources: []
          };
        })
      );

      return matchesWithExplanations;
    } catch (error) {
      console.error('Error generating candidate matches:', error);
      return [];
    }
  }

  private createUserProfileSummary(userResponses: UserResponse[]): string {
    // Create a simple summary of user preferences from responses
    const responsesText = userResponses
      .map(r => `${r.questionId}: ${this.extractTextFromResponse(r)}`)
      .join('\n');

    return `User responses summary:\n${responsesText}`;
  }

  private extractTextFromResponse(response: UserResponse): string {
    if (typeof response.value === 'string') return response.value;
    if (Array.isArray(response.value)) return response.value.join(', ');
    if (typeof response.value === 'object') return JSON.stringify(response.value);
    return String(response.value || '');
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

    if (candidate.key_positions && typeof candidate.key_positions === 'object') {
      const positions = Object.entries(candidate.key_positions)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      parts.push(`Key positions: ${positions}`);
    }

    return parts.join('. ') || 'No detailed information available.';
  }

  private calculateCandidateScore(candidate: any, userResponses: UserResponse[]): number {
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
    if (candidate.key_positions && typeof candidate.key_positions === 'object') {
      const positions = Object.keys(candidate.key_positions);
      policies.push(...positions.slice(0, 3)); // Take up to 3
    }

    // Extract from top_issues if available
    if (candidate.top_issues && policies.length < 3) {
      const issues = candidate.top_issues.split(',').map((s: string) => s.trim());
      policies.push(...issues.slice(0, 3 - policies.length));
    }

    return policies.slice(0, 3); // Ensure max 3 policies
  }
}