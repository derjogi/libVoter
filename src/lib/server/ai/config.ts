// Server-only AI configuration
export interface AIModelConfig {
  provider: "openai" | "anthropic" | "openrouter";
  model: string;
}

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;

function isSupportedProvider(
  value: string,
): value is AIModelConfig["provider"] {
  return SUPPORTED_PROVIDERS.includes(value as AIModelConfig["provider"]);
}

export function parseModelString(modelString: string): AIModelConfig {
  const separator = modelString.indexOf("/");
  if (separator === -1) {
    return { provider: "openai", model: modelString };
  }

  const prefix = modelString.slice(0, separator);
  const rest = modelString.slice(separator + 1);
  if (isSupportedProvider(prefix)) {
    if (prefix === "openrouter" && !rest.includes("/")) {
      throw new Error(
        `Invalid OpenRouter model "${modelString}". OpenRouter model ids must include an owner and model, for example "openrouter/openai/gpt-oss-20b:free" or "openrouter/meta-llama/llama-3.3-70b-instruct:free".`,
      );
    }
    return { provider: prefix, model: rest };
  }

  // OpenRouter model ids are themselves namespaced as "author/model". Treat
  // unknown leading namespaces as bare OpenRouter ids instead of stripping the
  // namespace and sending an invalid model like "model:free".
  return { provider: "openrouter", model: modelString };
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
    confidence: parseInt(process.env.AI_CONFIDENCE_THRESHOLD || "50", 10),
    minInteractions: parseInt(
      process.env.MIN_INTERACTIONS_BEFORE_RESULTS || "3",
      10,
    ),
  },
  limits: {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "64000", 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || "0.7"),
  },
};

export function getAIConfig() {
  return AI_CONFIG;
}
