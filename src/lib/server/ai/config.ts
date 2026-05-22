// Server-only AI configuration
export interface AIModelConfig {
  provider: "openai" | "anthropic" | "openrouter";
  model: string;
}

function parseModelString(modelString: string): AIModelConfig {
  const [provider, model] = modelString.split("/", 2);
  return { provider: provider as AIModelConfig["provider"], model };
}

export const AI_CONFIG = {
  models: {
    small: parseModelString(process.env.AI_MODEL_SMALL || "gpt-3.5-turbo"),
    large: parseModelString(process.env.AI_MODEL_LARGE || "gpt-4"),
    reasoning: parseModelString(
      process.env.AI_MODEL_REASONING || "gpt-4-turbo",
    ),
  },
  thresholds: {
    confidence: parseInt(process.env.AI_CONFIDENCE_THRESHOLD || "50"),
    minInteractions: parseInt(
      process.env.MIN_INTERACTIONS_BEFORE_RESULTS || "3",
    ),
  },
  limits: {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "64000"),
    temperature: parseFloat(process.env.AI_TEMPERATURE || "0.7"),
  },
};

export function getAIConfig() {
  return AI_CONFIG;
}
