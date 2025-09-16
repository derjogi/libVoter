// Server-only AI chat processing
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIConfig } from './config';
import { ConfidenceCalculator } from './confidence-calculator';
import { selectNextComponent, explainCandidateMatch, generateFollowupQuestion } from '@/lib/actions/prompts';
import { getUniqueWards, getCandidatesByWard, getMayorCandidates } from '@/lib/actions/database';
import { queryRAGContext } from '@/lib/actions/rag';
import type { ConversationMessage, UserResponse, ComponentData } from '@/types';
import type { AIModelConfig } from './config';

export interface ChatResponse {
  message: string;
  confidence: number;
  shouldShowCandidates: boolean;
  nextComponent?: ComponentData;
  candidateMatches?: any[];
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}

export class AIChatHandler {
  private chatModel: ChatOpenAI | ChatAnthropic;

  constructor() {
    const config = getAIConfig();
    const modelConfig = config.models.small;

    this.chatModel = this.createChatModel(modelConfig);
  }

  private createChatModel(modelConfig: AIModelConfig): ChatOpenAI | ChatAnthropic {
    const { provider, model } = modelConfig;
    const config = getAIConfig();

    switch (provider) {
      case 'openai':
        console.log('Using OpenAI model:', model);
        return new ChatOpenAI({
          modelName: model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          apiKey: process.env.OPENAI_API_KEY!,
          streaming: false, // Disable streaming to ensure complete responses
        });

      case 'anthropic':
        console.log("Using Anthropic model:", model);
        return new ChatAnthropic({
          modelName: model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
          streaming: false // Disable streaming to ensure complete responses
        });

      case 'openrouter':
        console.log("Using OpenRouter model:", model);
        return new ChatOpenAI({
          modelName: model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          apiKey: process.env.OPENROUTER_API_KEY!,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1'
          },
          streaming: false // Disable streaming to ensure complete responses
        });

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    userResponses: UserResponse[]
  ): Promise<ChatResponse> {
    try {
      // Calculate current confidence
      const confidenceResult = ConfidenceCalculator.calculate(
        userResponses,
        conversationHistory
      );

      // Always fetch eligible candidates for AI context
      const candidates = await this.generateCandidateMatches(userResponses);

      // Query RAG for semantically relevant candidate information
      const userContext = this.createUserProfileSummary(userResponses);
      const ragContext = await this.queryRAGContext(userMessage, userContext);

      // Prepare conversation context
      const messages = this.buildConversationContext(
        userMessage,
        conversationHistory,
        confidenceResult,
        candidates,
        ragContext
      );

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
        userResponses
      );
      console.log('Next component:', JSON.stringify(nextComponent));
      // Check if we should show candidates
      const config = getAIConfig();
      const shouldShowCandidates =
        confidenceResult.score >= config.thresholds.confidence &&
        userResponses.length >= config.thresholds.minInteractions;

      // Generate followup question if confidence is low
      let followupQuestion;
      if (confidenceResult.score < 70) {
        try {
          const context = `AI Response: ${responseText}\nConfidence: ${confidenceResult.score}/100\nReasoning: ${confidenceResult.reasoning}`;
          const followupResult = await generateFollowupQuestion(userMessage, context);
          if (followupResult.success && followupResult.data) {
            followupQuestion = {
              question: followupResult.data.question,
              type: followupResult.data.type,
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
        console.log(`AI request attempt ${attempt}/${maxRetries}`);
        const aiResponse = await this.chatModel.invoke(messages);
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
          candidates: [],
          relevantPolicies: [],
          sources: []
        };
      }
    } catch (error) {
      console.error('Error querying RAG context:', error);
      return {
        candidates: [],
        relevantPolicies: [],
        sources: []
      };
    }
  }

  private formatRAGContext(ragContext: any, existingCandidates: any[]): string {
    if (!ragContext || (!ragContext.relevantPolicies?.length && !ragContext.sources?.length)) {
      return '';
    }

    let ragInfo = '\n\nAdditional context from knowledge base:';

    // Add relevant policies that aren't already covered in structured data
    if (ragContext.relevantPolicies?.length > 0) {
      const existingPolicyTopics = new Set(
        existingCandidates.flatMap(c => c.topPolicies || []).map((p: string) => p.toLowerCase())
      );

      const newPolicies = ragContext.relevantPolicies.filter((policy: any) =>
        !existingPolicyTopics.has(policy.topic?.toLowerCase())
      );

      if (newPolicies.length > 0) {
        ragInfo += '\nRelevant policy positions:';
        newPolicies.slice(0, 3).forEach((policy: any) => {
          ragInfo += `\n- ${policy.topic}: ${policy.stance} - ${policy.details.substring(0, 100)}...`;
        });
      }
    }

    // Add sources if available
    if (ragContext.sources?.length > 0) {
      ragInfo += '\nSources: ' + ragContext.sources.slice(0, 3).join(', ');
    }

    return ragInfo;
  }

  private buildConversationContext(
    userMessage: string,
    history: ConversationMessage[],
    confidence: any,
    candidates: any[],
    ragContext: any
  ): (HumanMessage | AIMessage | SystemMessage)[] {
    const messages: (HumanMessage | AIMessage | SystemMessage)[] = [];

    // System prompt
    const candidateInfo = candidates.length > 0
      ? `\n\nAvailable candidates for consideration:\n${candidates.map(c =>
          `- ${c.name} (${c.party}): ${c.topPolicies.join(', ')}`
        ).join('\n')}`
      : '\n\nNo candidates available yet.';

    // Add RAG-enhanced context without duplicating structured data
    const ragInfo = this.formatRAGContext(ragContext, candidates);

    messages.push(new SystemMessage(
      `You are an AI political advisor helping users discover their voting preferences for the upcoming NZ local elections in Auckland.
      Current confidence level: ${confidence.score}/100
      Reasoning: ${confidence.reasoning}${candidateInfo}${ragInfo}

      Be conversational, neutral, and helpful. Ask follow-up questions to understand their views better.
      Focus on policy topics and candidate positions.`
    ));

    // Add recent conversation history (last 10 messages)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    }

    // Add current user message
    messages.push(new HumanMessage(userMessage));

    return messages;
  }

  private async determineNextComponent(
    userMessage: string,
    aiResponse: string,
    confidence: any,
    history: ConversationMessage[],
    userResponses: UserResponse[]
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
      const result = await selectNextComponent(conversationState);

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
      const wardResult = await getUniqueWards();
      if (wardResult.success && wardResult.data && wardResult.data.length > 0) {
        const options = wardResult.data.map(ward => ({ id: ward, label: ward, description: '' }));
        return {
          type: 'multiselect',
          data: {
            question: 'Which ward do you live in?',
            options,
            maxSelections: 1,
            questionId: 'ward_selection'
          }
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


  private async generateCandidateMatches(userResponses: UserResponse[]): Promise<any[]> {
    // Create user profile summary from responses
    const userProfile = this.createUserProfileSummary(userResponses);

    // Extract selected ward from user responses
    const wardResponse = userResponses.find(r => r.questionId === 'ward_selection');
    const selectedWard = wardResponse ? this.extractTextFromResponse(wardResponse) : null;

    let candidates: any[] = [];

    try {
      // Always fetch mayor candidates
      const mayorResult = await getMayorCandidates();
      if (mayorResult.success && mayorResult.data) {
        candidates = candidates.concat(mayorResult.data);
      }

      // Fetch ward candidates if ward is selected
      if (selectedWard) {
        const wardResult = await getCandidatesByWard(selectedWard);
        if (wardResult.success && wardResult.data) {
          candidates = candidates.concat(wardResult.data);
        }
      }

      // If no candidates found, return empty array
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

          // Generate explanation
          const explanationResult = await explainCandidateMatch(
            userProfile,
            info,
            score
          );

          // Extract top policies from candidate data
          const topPolicies = this.extractTopPolicies(candidate);

          return {
            id: candidate.id.toString(),
            name: candidate.name,
            party: candidate.party || 'Independent',
            score,
            reasoning: explanationResult.success ? explanationResult.data : 'Unable to generate explanation',
            topPolicies
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

    // Fallback if no policies found
    if (policies.length === 0) {
      policies.push('General representation', 'Community service', 'Local governance');
    }

    return policies.slice(0, 3); // Ensure max 3 policies
  }
}