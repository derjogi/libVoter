// Deterministic mock chat + embedding models for AI_MODE=mock.
// Mirrors enough of the LangChain ChatModel surface that the rest of the
// codebase can use it without changes.
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { pickMockResponse } from './__mocks__/responses';

export class MockChatModel {
  // Keep the public model property so callers that read it still work.
  readonly model = 'mock';

  async invoke(messages: any[]): Promise<AIMessage> {
    const text = extractPromptText(messages);
    const content = pickMockResponse(text);
    return new AIMessage(content);
  }
}

function extractPromptText(messages: any[]): string {
  // Concatenate all user/system message contents for sniffing.
  return messages
    .map((m) => {
      if (typeof m === 'string') return m;
      if (m?.content) return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return '';
    })
    .join('\n');
}

/**
 * Deterministic embedding model. Returns a fixed-dimension vector derived from
 * a simple character hash so the same input always returns the same output
 * (handy for vector-store assertions).
 */
export class MockEmbeddings {
  readonly model = 'mock-embeddings';
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
