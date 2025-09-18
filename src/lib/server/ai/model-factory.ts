// Server-only AI model factory for centralized model instantiation
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { OpenAIEmbeddings } from '@langchain/openai';
import { getAIConfig } from './config';
import type { AIModelConfig } from './config';
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

export type ChatModel = ChatOpenAI | ChatAnthropic;
export type EmbeddingModel = OpenAIEmbeddings | HuggingFaceTransformersEmbeddings;
/**
 * Creates a chat model instance based on the provided configuration
 */
export function createChatModel(modelConfig?: AIModelConfig): ChatModel {
  const config = getAIConfig();
  const finalConfig = modelConfig || config.models.small;

  const { provider, model } = finalConfig;

  switch (provider) {
    case 'openai':
      console.log('Using OpenAI chat model:', model);
      return new ChatOpenAI({
        modelName: model,
        temperature: config.limits.temperature,
        maxTokens: config.limits.maxTokens,
        apiKey: process.env.OPENAI_API_KEY!,
        streaming: false, // Disable streaming to ensure complete responses
      });

    case 'anthropic':
      console.log('Using Anthropic chat model:', model);
      return new ChatAnthropic({
        modelName: model,
        temperature: config.limits.temperature,
        maxTokens: config.limits.maxTokens,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
        streaming: false, // Disable streaming to ensure complete responses
      });

    case 'openrouter':
      console.log('Using OpenRouter chat model:', model);
      return new ChatOpenAI({
        modelName: model,
        temperature: config.limits.temperature,
        maxTokens: config.limits.maxTokens,
        apiKey: process.env.OPENROUTER_API_KEY!,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1'
        },
        streaming: false, // Disable streaming to ensure complete responses
      });

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Creates an embedding model instance
 * Currently only supports Huggingface embeddings (I don't have credit on OpenAI, and OpenRouter doesn't have embeddingModels)
 */
export function createEmbeddingModel(): EmbeddingModel {
  return new HuggingFaceTransformersEmbeddings();
}