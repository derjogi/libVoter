'use client';

import { useState, useCallback } from 'react';
import type { ConversationMessage, UserResponse } from '@/types';
import type { ChatResponse } from '@/lib/server/ai/chat-handler';
import type { Candidate } from '@/lib/db/schema';
import { processChatMessage } from '@/lib/actions/chat';

export function useChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [shouldShowCandidates, setShouldShowCandidates] = useState(false);
  const [followupQuestion, setFollowupQuestion] = useState<ChatResponse['followupQuestion']>(undefined);

  const sendMessage = useCallback(async (
    message: string,
    userResponses: UserResponse[],
    availableCandidates: Candidate[]
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // Add user message to history
      const userMessage: ConversationMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date()
      };

      const updatedHistory = [...messages, userMessage];
      setMessages(updatedHistory);

      // Process with AI
      const result = await processChatMessage(message, updatedHistory || [], userResponses || [], availableCandidates);

      if (!result) {
        throw new Error('No response from server');
      }

      // Add AI response to history
      const aiMessage: ConversationMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date(),
        componentData: result.nextComponent
      };

      setMessages(prev => [...prev, aiMessage]);
      setConfidence(result.confidence);
      setShouldShowCandidates(result.shouldShowCandidates);
      setFollowupQuestion(result.followupQuestion);

      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Chat error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setConfidence(0);
    setShouldShowCandidates(false);
    setFollowupQuestion(undefined);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    confidence,
    shouldShowCandidates,
    followupQuestion,
    sendMessage,
    clearChat
  };
}