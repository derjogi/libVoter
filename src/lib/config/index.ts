// Centralized configuration management
import { z } from "zod";

// Environment schema validation
const envSchema = z.object({
  // AI Mode: 'mock' returns deterministic fixtures (free, no network).
  // 'live' (default) calls real OpenAI/Anthropic/OpenRouter models.
  AI_MODE: z.enum(["mock", "live"]).default("live"),

  // AI Configuration. Not required in mock mode.
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL_SMALL: z.string().default("gpt-3.5-turbo"),
  AI_MODEL_LARGE: z.string().default("gpt-4"),
  AI_MODEL_REASONING: z.string().default("gpt-4-turbo"),
  AI_CONFIDENCE_THRESHOLD: z.string().default("60"),
  AI_MAX_TOKENS: z.string().default("2000"),
  AI_TEMPERATURE: z.string().default("0.7"),

  // Database Configuration
  DATABASE_URL: z.string().default("file:./voting-advisor.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Vector Database
  CHROMA_URL: z.string().url().default("http://localhost:8000"),

  // Development Settings
  USE_MOCK_DATA: z
    .string()
    .transform((val) => val === "true")
    .default(true),
  DEBUG_AI_RESPONSES: z
    .string()
    .transform((val) => val === "true")
    .default(false),
  DEBUG_CONFIDENCE_CALCULATION: z
    .string()
    .transform((val) => val === "true")
    .default(false),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // UI Configuration
  MOBILE_BREAKPOINT: z.string().default("768"),
  MAX_CANDIDATES_DISPLAY: z.string().default("10"),
  MIN_INTERACTIONS_BEFORE_RESULTS: z.string().default("3"),

  // Security (optional)
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Environment validation failed:");
  parsedEnv.error.issues.forEach((error) => {
    console.error(`  - ${error.path.join(".")}: ${error.message}`);
  });
  throw new Error("Invalid environment configuration");
}

export const config = {
  ai: {
    mode: parsedEnv.data.AI_MODE,
    openaiApiKey: parsedEnv.data.OPENAI_API_KEY,
    modelSmall: parsedEnv.data.AI_MODEL_SMALL,
    modelLarge: parsedEnv.data.AI_MODEL_LARGE,
    modelReasoning: parsedEnv.data.AI_MODEL_REASONING,
    confidenceThreshold: parseInt(parsedEnv.data.AI_CONFIDENCE_THRESHOLD, 10),
    maxTokens: parseInt(parsedEnv.data.AI_MAX_TOKENS, 10),
    temperature: parseFloat(parsedEnv.data.AI_TEMPERATURE),
  },

  database: {
    libsql: {
      url: parsedEnv.data.DATABASE_URL,
      authToken: parsedEnv.data.DATABASE_AUTH_TOKEN,
    },
  },

  vector: {
    chroma: {
      url: parsedEnv.data.CHROMA_URL,
    },
  },

  development: {
    useMockData: parsedEnv.data.USE_MOCK_DATA,
    debugAiResponses: parsedEnv.data.DEBUG_AI_RESPONSES,
    debugConfidenceCalculation: parsedEnv.data.DEBUG_CONFIDENCE_CALCULATION,
    nodeEnv: parsedEnv.data.NODE_ENV,
  },

  ui: {
    mobileBreakpoint: parseInt(parsedEnv.data.MOBILE_BREAKPOINT, 10),
    maxCandidatesDisplay: parseInt(parsedEnv.data.MAX_CANDIDATES_DISPLAY, 10),
    minInteractionsBeforeResults: parseInt(
      parsedEnv.data.MIN_INTERACTIONS_BEFORE_RESULTS,
      10,
    ),
  },

  security: {
    nextAuth: {
      secret: parsedEnv.data.NEXTAUTH_SECRET,
      url: parsedEnv.data.NEXTAUTH_URL,
    },
  },
} as const;

// Type-safe configuration
export type AppConfig = typeof config;

// Environment-specific configurations
export const getConfig = (): AppConfig => {
  return config;
};

export const isDevelopment = (): boolean => {
  return config.development.nodeEnv === "development";
};

export const isProduction = (): boolean => {
  return config.development.nodeEnv === "production";
};

export const shouldUseMockData = (): boolean => {
  return config.development.useMockData;
};

export const shouldDebugAI = (): boolean => {
  return config.development.debugAiResponses;
};

export const shouldDebugConfidence = (): boolean => {
  return config.development.debugConfidenceCalculation;
};
