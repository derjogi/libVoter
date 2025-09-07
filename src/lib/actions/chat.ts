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
