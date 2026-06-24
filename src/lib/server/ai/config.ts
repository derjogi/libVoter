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
    // `openrouter/<provider>/<model>` is our config shorthand for routing a
    // provider/model id through OpenRouter, so strip only that leading routing
    // prefix when the remainder is itself a namespaced model id. OpenRouter also
    // publishes models in its own namespace (for example `openrouter/free` and
    // `openrouter/owl-alpha`); those must be sent to OpenRouter unchanged.
    if (prefix === "openrouter" && !rest.includes("/")) {
      return { provider: prefix, model: modelString };
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
