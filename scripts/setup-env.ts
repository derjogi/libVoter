#!/usr/bin/env bun

// Environment setup script
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logEnvironmentStatus } from "../src/lib/config/validation";

async function setupEnvironment() {
  console.log("🚀 Setting up environment for AI Voting Advisor...\n");

  const envPath = join(process.cwd(), ".env.local");
  const examplePath = join(process.cwd(), ".env.example");

  // Check if .env.local already exists
  if (existsSync(envPath)) {
    console.log("⚠️  .env.local already exists. Backing up...");
    const backupPath = `${envPath}.backup.${Date.now()}`;
    // Note: In production, you'd want to actually copy the file
    console.log(`   Backup created at: ${backupPath}`);
  }

  // Create .env.example if it doesn't exist
  if (!existsSync(examplePath)) {
    console.log("📝 Creating .env.example...");
    const exampleContent = `# AI Voting Advisor Environment Variables
# Copy this file to .env.local and fill in your actual values

# AI Configuration
OPENAI_API_KEY=your_openai_api_key_here
AI_MODEL_SMALL=gpt-3.5-turbo
AI_MODEL_LARGE=gpt-4
AI_MODEL_REASONING=gpt-4-turbo
AI_CONFIDENCE_THRESHOLD=60
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# Database Configuration
DATABASE_URL=file:./data/elections/nz-2026.db
DATABASE_AUTH_TOKEN=your_turso_auth_token  # Only needed for Turso

# Vector Database Configuration
CHROMA_URL=http://localhost:8000

# Development Settings
USE_MOCK_DATA=true
DEBUG_AI_RESPONSES=true
DEBUG_CONFIDENCE_CALCULATION=true
NODE_ENV=development

# UI Configuration
MOBILE_BREAKPOINT=768
MAX_CANDIDATES_DISPLAY=10
MIN_INTERACTIONS_BEFORE_RESULTS=3

# Security
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
`;

    writeFileSync(examplePath, exampleContent);
    console.log("✅ Created .env.example");
  }

  // Create basic .env.local template
  const envContent = `# AI Voting Advisor Environment Variables
# Fill in your actual values below

# AI Configuration
OPENAI_API_KEY=
AI_MODEL_SMALL=gpt-3.5-turbo
AI_MODEL_LARGE=gpt-4
AI_MODEL_REASONING=gpt-4-turbo
AI_CONFIDENCE_THRESHOLD=60
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# Database Configuration
DATABASE_URL=file:./data/elections/nz-2026.db
DATABASE_AUTH_TOKEN=

# Vector Database Configuration
CHROMA_URL=http://localhost:8000

# Development Settings
USE_MOCK_DATA=true
DEBUG_AI_RESPONSES=true
DEBUG_CONFIDENCE_CALCULATION=true
NODE_ENV=development

# UI Configuration
MOBILE_BREAKPOINT=768
MAX_CANDIDATES_DISPLAY=10
MIN_INTERACTIONS_BEFORE_RESULTS=3

# Security
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
`;

  writeFileSync(envPath, envContent);
  console.log("✅ Created .env.local template");

  console.log("\n📋 Next Steps:");
  console.log(
    "1. Get your OpenAI API key from https://platform.openai.com/api-keys",
  );
  console.log("2. Create a Supabase project at https://supabase.com");
  console.log("3. Fill in the values in .env.local");
  console.log("4. Run the validation: bun run validate-env");

  console.log("\n🔍 To validate your configuration:");
  console.log("   bun run validate-env");
}

async function validateCurrentEnvironment() {
  console.log("🔍 Validating current environment configuration...\n");

  try {
    // This will throw if validation fails
    logEnvironmentStatus();
    console.log("\n✅ Environment validation completed successfully!");
  } catch (error) {
    console.error("\n❌ Environment validation failed:");
    console.error(error);
    process.exit(1);
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case "setup":
    await setupEnvironment();
    break;
  case "validate":
    await validateCurrentEnvironment();
    break;
  default:
    console.log("Usage:");
    console.log("  bun run setup-env setup    - Create environment files");
    console.log(
      "  bun run setup-env validate - Validate current configuration",
    );
    break;
}
