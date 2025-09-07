// Server-only AI chat processing
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIConfig } from './config';
import { ConfidenceCalculator } from './confidence-calculator';
import { selectNextComponent, explainCandidateMatch, generateFollowupQuestion } from '@/lib/actions/prompts';
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
          openAIApiKey: process.env.OPENAI_API_KEY!,
          streaming: false // Disable streaming to ensure complete responses
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

      // Prepare conversation context
      const messages = this.buildConversationContext(
        userMessage,
        conversationHistory,
        confidenceResult
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
        conversationHistory
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
        candidateMatches: shouldShowCandidates ? await this.generateCandidateMatches(userResponses) : undefined,
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

  private buildConversationContext(
    userMessage: string,
    history: ConversationMessage[],
    confidence: any
  ): (HumanMessage | AIMessage | SystemMessage)[] {
    const messages: (HumanMessage | AIMessage | SystemMessage)[] = [];

    // System prompt
    messages.push(new SystemMessage(
      `You are an AI political advisor helping users discover their voting preferences for the upcoming NZ local elections in Auckland.
      Current confidence level: ${confidence.score}/100
      Reasoning: ${confidence.reasoning}

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
    history: ConversationMessage[]
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
    // Simplified candidate matching - in production, use more sophisticated algorithm
    // This would integrate with the RAG system and database

    // Create user profile summary from responses
    const userProfile = this.createUserProfileSummary(userResponses);

    // Mock candidates - in production, these would come from database
    const mockCandidates = [
      {
        id: 'candidate_1',
        name: 'Jane Smith',
        party: 'Democratic',
        score: 85,
        info: 'Progressive candidate focused on healthcare reform, climate action, and economic equality. Supports universal healthcare, green energy transition, and progressive taxation.',
        topPolicies: ['Healthcare reform', 'Climate action', 'Economic equality']
      },
      {
        id: 'candidate_2',
        name: 'John Doe',
        party: 'Republican',
        score: 72,
        info: 'Conservative candidate emphasizing fiscal responsibility, national security, and traditional values. Advocates for tax cuts, strong borders, and Second Amendment rights.',
        topPolicies: ['Tax reduction', 'Border security', 'Second Amendment']
      }
    ];

    // Generate explanations using centralized function
    const matchesWithExplanations = await Promise.all(
      mockCandidates.map(async (candidate) => {
        const explanationResult = await explainCandidateMatch(
          userProfile,
          candidate.info,
          candidate.score
        );

        return {
          id: candidate.id,
          name: candidate.name,
          party: candidate.party,
          score: candidate.score,
          reasoning: explanationResult.success ? explanationResult.data : 'Unable to generate explanation',
          topPolicies: candidate.topPolicies
        };
      })
    );

    return matchesWithExplanations;
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
}