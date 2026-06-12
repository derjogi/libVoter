// Server-only AI model factory for centralized model instantiation
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { OpenAIEmbeddings } from "@langchain/openai";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { MockChatModel, MockEmbeddings } from "./mock-models";
import type { Embeddings } from "@langchain/core/embeddings";
import { getAIConfig } from "./config";
import type { AIModelConfig } from "./config";

export type ChatModel = ChatOpenAI | ChatAnthropic | MockChatModel;
export type EmbeddingModel =
  | OpenAIEmbeddings
  | HuggingFaceTransformersEmbeddings
  | MockEmbeddings;

/** Returns true when AI_MODE=mock is set (free, deterministic responses). */
export function isMockMode(): boolean {
  return process.env.AI_MODE === "mock";
}

/**
 * Creates a chat model instance based on the provided configuration
 */
export function createChatModel(modelConfig?: AIModelConfig): ChatModel {
  if (isMockMode()) {
    console.log("AI_MODE=mock — using MockChatModel");
    return new MockChatModel();
  }

  const config = getAIConfig();
  const finalConfig = modelConfig || config.models.small;

  const { provider, model } = finalConfig;

  switch (provider) {
    case "openai":
      if (process.env.OPENAI_API_KEY) {
        console.log("Using OpenAI chat model:", model);
        return new ChatOpenAI({
          model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          apiKey: process.env.OPENAI_API_KEY!,
          streaming: false,
        });
      }

    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        console.log("Using Anthropic chat model:", model);
        return new ChatAnthropic({
          model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          apiKey: process.env.ANTHROPIC_API_KEY!,
          streaming: false,
        });
      }

    case "openrouter":
      if (process.env.OPENROUTER_API_KEY) {
        console.log(
          "Using OpenRouter chat model:",
          model,
          "(routed from provider:",
          provider,
          ")",
        );
        return new ChatOpenAI({
          model,
          temperature: config.limits.temperature,
          maxTokens: config.limits.maxTokens,
          apiKey: process.env.OPENROUTER_API_KEY!,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1",
          },
          streaming: false,
        });
      }

    default:
      throw new Error(
        `Unsupported AI provider or required API key not set: ${provider}`,
      );
  }
}

/**
 * Creates an embedding model instance.
 * AI_MODE=mock returns a deterministic in-memory MockEmbeddings; otherwise
 * Huggingface (no API costs).
 */
export function createEmbeddingModel(): EmbeddingModel {
  if (isMockMode()) {
    return new MockEmbeddings();
  }
  return new HuggingFaceTransformersEmbeddings({
    model: process.env.HF_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
  });
}
