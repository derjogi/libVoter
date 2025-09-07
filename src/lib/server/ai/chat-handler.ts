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

    // Build prompt for AI to decide next component
    const componentPrompt = this.buildComponentSelectionPrompt(
      userMessage,
      aiResponse,
      confidence,
      history
    );

    try {
      const componentDecision = await this.chatModel.invoke([
        new SystemMessage(componentPrompt.system),
        new HumanMessage(componentPrompt.user)
      ]);

      const decisionText = componentDecision.content as string;
      console.log('Component decision text:', decisionText);
      const parsedDecision = this.parseComponentDecision(decisionText);

      if (parsedDecision) {
        return parsedDecision;
      }
    } catch (error) {
      console.error('Error determining next component with AI:', error);
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

  private buildComponentSelectionPrompt(
    userMessage: string,
    aiResponse: string,
    confidence: any,
    history: ConversationMessage[]
  ): { system: string; user: string } {
    const recentHistory = history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n');

    const system = `You are an AI assistant helping to determine the next interactive component for a political voting advisor app.

Available component types and their EXACT data structures (based on TypeScript interfaces):

1. chat: Continue conversational interaction
   Data structure: { "messages": ConversationMessage[], "placeholder": string }

2. yesno: Ask a yes/no question about a specific statement
   Data structure: { "statement": string, "context": string }

3. multiselect: Allow user to select multiple options from a list
   Data structure: {
     "question": string,
     "options": [{ "id": string, "label": string, "description": string }],
     "maxSelections": number
   }

4. freetext: Ask for open-ended text response
   Data structure: { "prompt": string, "placeholder": string, "maxLength": number }

5. swipe: Present statements for user to swipe left/right (agree/disagree)
   Data structure: {
     "statements": [{ "id": string, "text": string, "context": string }]
   }

6. slider: Use a slider for quantitative responses
   Data structure: {
     "label": string,
     "min": number,
     "max": number,
     "step": number,
     "unit": string,
     "description": string
   }

Current context:
- Confidence score: ${confidence.score}/100
- Reasoning: ${confidence.reasoning}
- Recent conversation:
${recentHistory}

Your task: Choose the most appropriate next component type that will best help narrow down the user's political preferences. Then generate the specific data for that component using the EXACT structure specified above.

Respond with a JSON object in this format:
{
  "componentType": "chat|yesno|multiselect|freetext|swipe|slider",
  "data": {
    // Use the exact structure for the chosen component type - no extra fields
  },
  "reasoning": "Brief explanation of why this component was chosen"
}

Guidelines for data generation:
- swipe: Generate up to 10 relevant political statements with unique IDs (e.g., "stmt_1", "stmt_2")
- multiselect: Provide up to 10 options with unique IDs (e.g., "opt_1", "opt_2"), labels, and descriptions
- yesno: Provide one clear, specific statement about a political issue
- slider: Set appropriate min/max values (e.g., 0-10 for agreement levels, 0-100 for percentages, 100 (100k) -10'000 (10m) for budgeting questions, ...), include unit and description
- chat: Use empty messages array and a relevant placeholder text
- freetext: Include a clear prompt, placeholder text, and optional maxLength`;

    const user = `User's latest message: "${userMessage}"
AI's previous response: "${aiResponse}"

Based on this conversation, what should be the next component to engage the user and gather more information about their political views?`;

    return { system, user };
  }

  private parseComponentDecision(decisionText: string): ComponentData | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = decisionText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.componentType || !parsed.data) return null;

      return {
        type: parsed.componentType,
        data: parsed.data
      };
    } catch (error) {
      console.error('Failed to parse component decision:', error);
      return null;
    }
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