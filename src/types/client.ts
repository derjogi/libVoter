// Client-safe types (can be imported anywhere)
export type ClientConfig = {};

export interface LocalStorageData {
  sessionId: string;
  userResponses: import("./index").UserResponse[];
  conversationHistory: import("./index").ConversationMessage[];
  lastUpdated: Date;
}
