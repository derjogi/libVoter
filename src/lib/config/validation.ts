// Environment validation utilities
import { getConfig } from "./index";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const config = getConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check AI configuration
  if (!config.ai.openaiApiKey || config.ai.openaiApiKey.length < 20) {
    errors.push("OPENAI_API_KEY is missing or invalid");
  }

  // Check database configuration
  if (!config.database.libsql.url) {
    errors.push("DATABASE_URL is missing");
  }

  // Check vector database
  try {
    new URL(config.vector.chroma.url);
  } catch {
    warnings.push("CHROMA_URL is not a valid URL - using default localhost");
  }

  // Development warnings
  if (config.development.useMockData) {
    warnings.push(
      "USE_MOCK_DATA is enabled - using mock data instead of real APIs",
    );
  }

  if (
    config.ai.confidenceThreshold < 30 ||
    config.ai.confidenceThreshold > 90
  ) {
    warnings.push(
      "AI_CONFIDENCE_THRESHOLD is outside recommended range (30-90)",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function logEnvironmentStatus(): void {
  const validation = validateEnvironment();
  const config = getConfig();

  console.log("🔧 Environment Configuration Status:");
  console.log("=====================================");

  if (validation.isValid) {
    console.log("✅ Configuration is valid");
  } else {
    console.log("❌ Configuration has errors:");
    validation.errors.forEach((error) => console.log(`  - ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.log("⚠️  Warnings:");
    validation.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  console.log("\n📊 Current Configuration:");
  console.log(`  Environment: ${config.development.nodeEnv}`);
  console.log(`  AI Model (Large): ${config.ai.modelLarge}`);
  console.log(`  Confidence Threshold: ${config.ai.confidenceThreshold}%`);
  console.log(
    `  Mock Data: ${config.development.useMockData ? "Enabled" : "Disabled"}`,
  );
  console.log(
    `  Debug AI: ${config.development.debugAiResponses ? "Enabled" : "Disabled"}`,
  );
}
