'use server';

import { AIChatHandler, type ChatResponse } from '@/lib/server/ai/chat-handler';
import type { ConversationMessage, UserResponse } from '@/types';

let chatHandler: AIChatHandler | null = null;

function getChatHandler() {
  if (!chatHandler) {
    chatHandler = new AIChatHandler();
  }
  return chatHandler;
}

export async function processChatMessage(
  message: string,
  conversationHistory: ConversationMessage[],
  userResponses: UserResponse[]
): Promise<ChatResponse> {
  try {
    const handler = getChatHandler();
    const response = await handler.processMessage(message, conversationHistory, userResponses);

    return response;
  } catch (error) {
    console.error('Chat processing failed:', error);
    return {
      message: 'I apologize, but I encountered an error processing your message. Please try again.',
      confidence: 0,
      shouldShowCandidates: false
    };
  }
}

export async function generateNextQuestion(
  conversationHistory: ConversationMessage[],
  userResponses: UserResponse[],
  questionType: string = 'chat'
): Promise<{ question: string; type: string; context?: string }> {
  try {
    const handler = getChatHandler();

    // Generate a contextual question
    const prompt = `Based on this conversation history, generate a ${questionType} question to better understand the user's political preferences.

Conversation:
${conversationHistory.map(h => `${h.role}: ${h.content}`).join('\n')}

User responses so far: ${userResponses.length}

Generate a question that explores new territory or digs deeper into their views.`;

    // This is a simplified implementation - in production, use the AI handler
    const questions = {
      chat: 'What specific policy areas are most important to you?',
      yesno: 'Do you support increasing the minimum wage to $15 per hour?',
      multiselect: 'Which of these social issues matter most to you?'
    };

    return {
      question: questions[questionType as keyof typeof questions] || questions.chat,
      type: questionType,
      context: 'Exploring user preferences'
    };

  } catch (error) {
    console.error('Question generation failed:', error);
    return {
      question: 'What are your thoughts on current political issues?',
      type: 'chat',
      context: 'Fallback question'
    };
  }
}