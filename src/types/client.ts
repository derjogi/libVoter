// Client-safe types (can be imported anywhere)
export interface ClientConfig {
  // No database config needed for client - all DB operations are server-side
}

export interface LocalStorageData {
  sessionId: string;
  userResponses: import('./index').UserResponse[];
  conversationHistory: import('./index').ConversationMessage[];
  lastUpdated: Date;
}