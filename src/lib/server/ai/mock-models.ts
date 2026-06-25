// Deterministic mock chat + embedding models for AI_MODE=mock.
// Mirrors enough of the LangChain ChatModel surface that the rest of the
// codebase can use it without changes.

import { AIMessage } from "@langchain/core/messages";
import {
  MOCK_CANDIDATE_RANKING,
  MOCK_CHAT_TURN,
  pickMockResponse,
} from "./__mocks__/responses";

export class MockChatModel {
  // Keep the public model property so callers that read it still work.
  readonly model = "mock";

  async invoke(messages: any[]): Promise<AIMessage> {
    const text = extractPromptText(messages);
    const content = pickMockResponse(text);
    return new AIMessage({ content });
  }

  /**
   * Mirrors LangChain's withStructuredOutput: returns a runnable whose invoke
   * resolves to a deterministic, schema-valid chat turn (AI_MODE=mock).
   */
  withStructuredOutput<T = typeof MOCK_CHAT_TURN>(
    _schema: unknown,
    config?: unknown,
  ): { invoke: (messages: unknown) => Promise<T> } {
    const name = (config as { name?: string } | undefined)?.name;
    return {
      invoke: async (_messages: unknown): Promise<T> => {
        // Branch on the caller's schema name so each structured call gets a
        // fixture of the right shape.
        if (name === "candidate_ranking") {
          return MOCK_CANDIDATE_RANKING as unknown as T;
        }
        return MOCK_CHAT_TURN as unknown as T;
      },
    };
  }
}

function extractPromptText(messages: any[]): string {
  // Concatenate all user/system message contents for sniffing.
  return messages
    .map((m) => {
      if (typeof m === "string") return m;
      if (m?.content)
        return typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      return "";
    })
    .join("\n");
}

/**
 * Deterministic embedding model. Returns a fixed-dimension vector derived from
 * a simple character hash so the same input always returns the same output
 * (handy for vector-store assertions).
 */
export class MockEmbeddings {
  readonly model = "mock-embeddings";
  readonly dimensions = 16;

  async embedQuery(text: string): Promise<number[]> {
    return this.fakeVector(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.fakeVector(t));
  }

  private fakeVector(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      v[i % this.dimensions] += text.charCodeAt(i) / 1000;
    }
    return v;
  }
}
