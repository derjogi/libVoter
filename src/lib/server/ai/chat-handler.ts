// Server-only AI chat processing
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIConfig } from './config';
import { ConfidenceCalculator } from './confidence-calculator';
import type { ConversationMessage, UserResponse, ComponentData } from '@/types';
import type { AIModelConfig } from './config';

export interface ChatResponse {
  message: string;
  confidence: number;
  shouldShowCandidates: boolean;
  nextComponent?: ComponentData;
  candidateMatches?: any[];
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
          openAIApiKey: process.env.OPENAI_API_KEY!
        });

      case 'anthropic':
        console.log("Using Anthropic model:", model);
        return new ChatAnthropic({
          modelName: model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!
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
          }
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

      // Get AI response
      console.log(`Processing message ${messages} with AI model: ${JSON.stringify(this.chatModel)}`);
      const aiResponse = await this.chatModel.invoke(messages);
      const responseText = aiResponse.content as string;

      // Determine next component based on context
      const nextComponent = await this.determineNextComponent(
        userMessage,
        responseText,
        confidenceResult,
        conversationHistory
      );

      // Check if we should show candidates
      const config = getAIConfig();
      const shouldShowCandidates =
        confidenceResult.score >= config.thresholds.confidence &&
        userResponses.length >= config.thresholds.minInteractions;

      return {
        message: responseText,
        confidence: confidenceResult.score,
        shouldShowCandidates,
        nextComponent,
        candidateMatches: shouldShowCandidates ? await this.generateCandidateMatches(userResponses) : undefined
      };

    } catch (error) {
      console.error('AI chat processing error:', error);
      throw new Error('Failed to process chat message');
    }
  }

  private buildConversationContext(
    userMessage: string,
    history: ConversationMessage[],
    confidence: any
  ): (HumanMessage | AIMessage | SystemMessage)[] {
    const messages: (HumanMessage | AIMessage | SystemMessage)[] = [];

    // System prompt
    messages.push(new SystemMessage(
      `You are an AI political advisor helping users discover their voting preferences.
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
    // Simple logic to determine next component - enhance with AI in production
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

    // If we have enough responses, suggest a different interaction type
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

    // For now, return mock matches
    return [
      {
        id: 'candidate_1',
        name: 'Jane Smith',
        party: 'Democratic',
        score: 85,
        reasoning: 'Strong alignment with progressive policies',
        topPolicies: ['Healthcare reform', 'Climate action', 'Economic equality']
      },
      {
        id: 'candidate_2',
        name: 'John Doe',
        party: 'Republican',
        score: 72,
        reasoning: 'Conservative positions on key issues',
        topPolicies: ['Tax reduction', 'Border security', 'Second Amendment']
      }
    ];
  }
}