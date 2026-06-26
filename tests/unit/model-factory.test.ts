import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatOpenAI: vi.fn(function ChatOpenAIMock(config: unknown) {
    return { kind: "openai", config };
  }),
  chatAnthropic: vi.fn(function ChatAnthropicMock(config: unknown) {
    return { kind: "anthropic", config };
  }),
  embeddings: vi.fn(function EmbeddingsMock(config: unknown) {
    return { kind: "embeddings", config };
  }),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: mocks.chatOpenAI,
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: mocks.chatAnthropic,
}));

vi.mock("@langchain/community/embeddings/huggingface_transformers", () => ({
  HuggingFaceTransformersEmbeddings: mocks.embeddings,
}));

vi.mock("@/lib/server/ai/mock-models", () => ({
  MockChatModel: vi.fn(() => ({ kind: "mock-chat" })),
  MockEmbeddings: vi.fn(() => ({ kind: "mock-embeddings" })),
}));

const { createChatModel } = await import("@/lib/server/ai/model-factory");

describe("createChatModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sends openrouter-prefixed known-provider ids to OpenRouter without the routing prefix", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");

    createChatModel({
      provider: "openrouter",
      model: "google/gemma-4-31b-it:free",
    });

    expect(mocks.chatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "google/gemma-4-31b-it:free",
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
      }),
    );
    expect(mocks.chatAnthropic).not.toHaveBeenCalled();
  });

  it("falls back to OpenRouter using a provider/model id when a native key is unavailable", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");

    createChatModel({ provider: "openai", model: "gpt-4o-mini" });

    expect(mocks.chatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-4o-mini",
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
      }),
    );
  });
});
