'use server';

import { AIChatHandler, type ChatResponse } from '@/lib/server/ai/chat-handler';
import type { ConversationMessage, UserResponse } from '@/types';
import type { Candidate } from '@/lib/db/schema';

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
  userResponses: UserResponse[],
  availableCandidates: Candidate[]
): Promise<ChatResponse> {
  try {
    const handler = getChatHandler();
    console.log('processChatMessage: \n', message);
    const response = await handler.processMessage(message, conversationHistory, userResponses, availableCandidates);

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
