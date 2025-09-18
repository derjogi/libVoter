'use server';

import { getPromptManager } from '@/lib/server/prompts/manager';
import type { ConversationMessage, UserResponse } from '@/types';

export async function generateNextQuestion(
  conversationHistory: ConversationMessage[],
  userResponses: UserResponse[],
  questionType: string = 'chat'
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateNextQuestion(conversationHistory, userResponses, questionType);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: 'What are your thoughts on current political issues?',
          type: 'chat',
          context: 'General political discussion'
        }
      };
    }

    // Parse the JSON response
    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      // If JSON parsing fails, return a fallback
      return {
        success: false,
        error: 'Failed to parse AI response',
        fallback: {
          question: result.response, // Use raw response as question
          type: questionType,
          context: 'AI-generated question'
        }
      };
    }
  } catch (error) {
    console.error('Question generation failed:', error);
    return {
      success: false,
      error: 'Failed to generate question',
      fallback: {
        question: 'What political topics interest you most?',
        type: 'chat',
        context: 'Fallback question'
      }
    };
  }
}

export async function generateFollowupQuestion(
  lastResponse: string,
  context: string
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateFollowupQuestion(lastResponse, context);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: 'Can you tell me more about that?',
          type: 'chat',
          reasoning: 'Follow-up to previous response'
        }
      };
    }

    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse followup response',
        fallback: {
          question: result.response,
          type: 'chat',
          reasoning: 'AI-generated followup'
        }
      };
    }
  } catch (error) {
    console.error('Followup generation failed:', error);
    return {
      success: false,
      error: 'Failed to generate followup',
      fallback: {
        question: 'Can you elaborate on your previous answer?',
        type: 'chat',
        reasoning: 'Fallback followup'
      }
    };
  }
}

export async function selectNextComponent(
  conversationState: string
) {
  try {
    const manager = getPromptManager();
    const result = await manager.selectComponent(conversationState);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          component: 'chat',
          reasoning: 'Default to chat interface',
          data: { placeholder: 'Continue the conversation...' }
        }
      };
    }

    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse component selection',
        fallback: {
          component: 'chat',
          reasoning: 'Fallback to chat',
          data: { placeholder: 'What would you like to discuss?' }
        }
      };
    }
  } catch (error) {
    console.error('Component selection failed:', error);
    return {
      success: false,
      error: 'Failed to select component',
      fallback: {
        component: 'chat',
        reasoning: 'Error fallback',
        data: { placeholder: 'Please continue...' }
      }
    };
  }
}

export async function explainCandidateMatch(
  userProfile: string,
  candidateInfo: string,
  matchScore: number
) {
  try {
    const manager = getPromptManager();
    console.log("Explaining Match...")
    const result = await manager.explainMatch(userProfile, candidateInfo, matchScore);

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Match explanation failed:', error);
    return {
      success: false,
      error: 'Failed to generate explanation',
      data: 'This candidate appears to align with your stated preferences.'
    };
  }
}

export async function summarizeUserPreferences(
  userResponses: UserResponse[]
) {
  try {
    const manager = getPromptManager();
    const result = await manager.summarizePreferences(userResponses);

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Preference summarization failed:', error);
    return {
      success: false,
      error: 'Failed to summarize preferences',
      data: 'Based on your responses, you have shown interest in various political topics.'
    };
  }
}