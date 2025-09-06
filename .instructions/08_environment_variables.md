# Environment Variables Configuration

## Overview
This document defines the environment variables needed for the AI voting advisor prototype. These should be configured in a `.env.local` file in the Next.js project root. The configuration supports both development and production environments.

## Dependencies
```bash
# No additional packages needed - Next.js handles environment variables natively
```

## Implementation Steps

### 1. Create Environment Configuration Files
Create the following files in the Next.js project:

**File: `voting-advisor/.env.local`**
```bash
# ===========================================
# AI VOTING ADVISOR - ENVIRONMENT CONFIGURATION
# ===========================================

# AI Configuration
OPENAI_API_KEY=your_openai_api_key_here
AI_MODEL_SMALL=gpt-3.5-turbo
AI_MODEL_LARGE=gpt-4
AI_MODEL_REASONING=gpt-4-turbo
AI_CONFIDENCE_THRESHOLD=60
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# Database Configuration
DATABASE_URL=file:./voting-advisor.db
DATABASE_AUTH_TOKEN=your_turso_auth_token

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
```

**File: `voting-advisor/.env.example`**
```bash
# Copy this file to .env.local and fill in your values

# AI Configuration
OPENAI_API_KEY=
AI_MODEL_SMALL=gpt-3.5-turbo
AI_MODEL_LARGE=gpt-4
AI_MODEL_REASONING=gpt-4-turbo
AI_CONFIDENCE_THRESHOLD=60
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# Database Configuration
DATABASE_URL=file:./voting-advisor.db
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
```

### 2. Create Configuration Management
**File: `voting-advisor/src/lib/config/index.ts`**
```typescript
// Centralized configuration management
import { z } from 'zod';

// Environment schema validation
const envSchema = z.object({
  // AI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  AI_MODEL_SMALL: z.string().default('gpt-3.5-turbo'),
  AI_MODEL_LARGE: z.string().default('gpt-4'),
  AI_MODEL_REASONING: z.string().default('gpt-4-turbo'),
  AI_CONFIDENCE_THRESHOLD: z.string().transform(val => parseInt(val)).default('60'),
  AI_MAX_TOKENS: z.string().transform(val => parseInt(val)).default('2000'),
  AI_TEMPERATURE: z.string().transform(val => parseFloat(val)).default('0.7'),

  // Database Configuration
  DATABASE_URL: z.string().default('file:./voting-advisor.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Vector Database
  CHROMA_URL: z.string().url().default('http://localhost:8000'),

  // Development Settings
  USE_MOCK_DATA: z.string().transform(val => val === 'true').default(true),
  DEBUG_AI_RESPONSES: z.string().transform(val => val === 'true').default(false),
  DEBUG_CONFIDENCE_CALCULATION: z.string().transform(val => val === 'true').default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // UI Configuration
  MOBILE_BREAKPOINT: z.string().transform(val => parseInt(val)).default('768'),
  MAX_CANDIDATES_DISPLAY: z.string().transform(val => parseInt(val)).default('10'),
  MIN_INTERACTIONS_BEFORE_RESULTS: z.string().transform(val => parseInt(val)).default('3'),

  // Security (optional)
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment validation failed:');
  parsedEnv.error.errors.forEach(error => {
    console.error(`  - ${error.path.join('.')}: ${error.message}`);
  });
  throw new Error('Invalid environment configuration');
}

export const config = {
  ai: {
    openaiApiKey: parsedEnv.data.OPENAI_API_KEY,
    modelSmall: parsedEnv.data.AI_MODEL_SMALL,
    modelLarge: parsedEnv.data.AI_MODEL_LARGE,
    modelReasoning: parsedEnv.data.AI_MODEL_REASONING,
    confidenceThreshold: parsedEnv.data.AI_CONFIDENCE_THRESHOLD,
    maxTokens: parsedEnv.data.AI_MAX_TOKENS,
    temperature: parsedEnv.data.AI_TEMPERATURE,
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
    mobileBreakpoint: parsedEnv.data.MOBILE_BREAKPOINT,
    maxCandidatesDisplay: parsedEnv.data.MAX_CANDIDATES_DISPLAY,
    minInteractionsBeforeResults: parsedEnv.data.MIN_INTERACTIONS_BEFORE_RESULTS,
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
  return config.development.nodeEnv === 'development';
};

export const isProduction = (): boolean => {
  return config.development.nodeEnv === 'production';
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
```

### 3. Create Environment Validation Utility
**File: `voting-advisor/src/lib/config/validation.ts`**
```typescript
// Environment validation utilities
import { getConfig } from './index';

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
    errors.push('OPENAI_API_KEY is missing or invalid');
  }

  // Check database configuration
  if (!config.database.libsql.url) {
    errors.push('DATABASE_URL is missing');
  }

  // Check vector database
  try {
    new URL(config.vector.chroma.url);
  } catch {
    warnings.push('CHROMA_URL is not a valid URL - using default localhost');
  }

  // Development warnings
  if (config.development.useMockData) {
    warnings.push('USE_MOCK_DATA is enabled - using mock data instead of real APIs');
  }

  if (config.ai.confidenceThreshold < 30 || config.ai.confidenceThreshold > 90) {
    warnings.push('AI_CONFIDENCE_THRESHOLD is outside recommended range (30-90)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function logEnvironmentStatus(): void {
  const validation = validateEnvironment();
  const config = getConfig();

  console.log('🔧 Environment Configuration Status:');
  console.log('=====================================');

  if (validation.isValid) {
    console.log('✅ Configuration is valid');
  } else {
    console.log('❌ Configuration has errors:');
    validation.errors.forEach(error => console.log(`  - ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    validation.warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  console.log('\n📊 Current Configuration:');
  console.log(`  Environment: ${config.development.nodeEnv}`);
  console.log(`  AI Model (Large): ${config.ai.modelLarge}`);
  console.log(`  Confidence Threshold: ${config.ai.confidenceThreshold}%`);
  console.log(`  Mock Data: ${config.development.useMockData ? 'Enabled' : 'Disabled'}`);
  console.log(`  Debug AI: ${config.development.debugAiResponses ? 'Enabled' : 'Disabled'}`);
}
```

### 4. Create Next.js Configuration
**File: `voting-advisor/next.config.ts`**
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Environment variables that should be available at build time
  env: {
    AI_CONFIDENCE_THRESHOLD: process.env.AI_CONFIDENCE_THRESHOLD,
    USE_MOCK_DATA: process.env.USE_MOCK_DATA,
    DEBUG_AI_RESPONSES: process.env.DEBUG_AI_RESPONSES,
  },

  // Experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: ['@langchain/openai', '@langchain/community'],
  },

  // Image optimization settings
  images: {
    domains: ['localhost'],
    remotePatterns: [
      // Add any remote patterns needed for your deployment
    ],
  },

  // TypeScript strict mode
  typescript: {
    tsconfigPath: './tsconfig.json',
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Webpack configuration for better module resolution
  webpack: (config, { isServer }) => {
    // Handle server-only imports
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/server': require('path').resolve(__dirname, 'src/lib/server'),
      };
    }

    return config;
  },
};

export default nextConfig;
```

### 5. Create Environment Setup Script
**File: `voting-advisor/scripts/setup-env.ts`**
```typescript
#!/usr/bin/env bun

// Environment setup script
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { validateEnvironment, logEnvironmentStatus } from '../src/lib/config/validation';

async function setupEnvironment() {
  console.log('🚀 Setting up environment for AI Voting Advisor...\n');

  const envPath = join(process.cwd(), '.env.local');
  const examplePath = join(process.cwd(), '.env.example');

  // Check if .env.local already exists
  if (existsSync(envPath)) {
    console.log('⚠️  .env.local already exists. Backing up...');
    const backupPath = `${envPath}.backup.${Date.now()}`;
    // Note: In production, you'd want to actually copy the file
    console.log(`   Backup created at: ${backupPath}`);
  }

  // Create .env.example if it doesn't exist
  if (!existsSync(examplePath)) {
    console.log('📝 Creating .env.example...');
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
DATABASE_URL=file:./voting-advisor.db
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
    console.log('✅ Created .env.example');
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
DATABASE_URL=file:./voting-advisor.db
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
  console.log('✅ Created .env.local template');

  console.log('\n📋 Next Steps:');
  console.log('1. Get your OpenAI API key from https://platform.openai.com/api-keys');
  console.log('2. Create a Supabase project at https://supabase.com');
  console.log('3. Fill in the values in .env.local');
  console.log('4. Run the validation: bun run validate-env');

  console.log('\n🔍 To validate your configuration:');
  console.log('   bun run validate-env');
}

async function validateCurrentEnvironment() {
  console.log('🔍 Validating current environment configuration...\n');

  try {
    // This will throw if validation fails
    logEnvironmentStatus();
    console.log('\n✅ Environment validation completed successfully!');
  } catch (error) {
    console.error('\n❌ Environment validation failed:');
    console.error(error);
    process.exit(1);
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'setup':
    await setupEnvironment();
    break;
  case 'validate':
    await validateCurrentEnvironment();
    break;
  default:
    console.log('Usage:');
    console.log('  bun run setup-env setup    - Create environment files');
    console.log('  bun run setup-env validate - Validate current configuration');
    break;
}
```

### 6. Update package.json Scripts
Add the following scripts to `voting-advisor/package.json`:

```json
{
  "scripts": {
    "setup-env": "bun run scripts/setup-env.ts",
    "validate-env": "bun run scripts/setup-env.ts validate",
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint"
  }
}
```

## Required Environment Variables

### AI Configuration
```bash
OPENAI_API_KEY=your_openai_api_key_here  # Required - Get from OpenAI
AI_MODEL_SMALL=gpt-3.5-turbo             # Default model for simple tasks
AI_MODEL_LARGE=gpt-4                     # Default model for complex reasoning
AI_MODEL_REASONING=gpt-4-turbo           # Model for deep analysis
AI_CONFIDENCE_THRESHOLD=60               # Confidence level (0-100) to show candidates
AI_MAX_TOKENS=2000                      # Maximum tokens per AI request
AI_TEMPERATURE=0.7                      # AI creativity level (0-1)
```

### Database Configuration
```bash
DATABASE_URL=file:./voting-advisor.db                   # Local SQLite file for development
DATABASE_AUTH_TOKEN=your_turso_auth_token               # Auth token for Turso (production)
```

### Vector Database Configuration
```bash
CHROMA_URL=http://localhost:8000  # Chroma vector database URL
```

### Development Settings
```bash
USE_MOCK_DATA=true              # Use mock data instead of real APIs
DEBUG_AI_RESPONSES=true         # Log AI responses for debugging
DEBUG_CONFIDENCE_CALCULATION=true # Log confidence calculations
NODE_ENV=development            # Environment mode
```

### UI Configuration
```bash
MOBILE_BREAKPOINT=768           # Screen width for mobile layout
MAX_CANDIDATES_DISPLAY=10       # Maximum candidates to show initially
MIN_INTERACTIONS_BEFORE_RESULTS=3 # Minimum interactions before showing results
```

## Setup Instructions

### 1. Initial Setup
```bash
# Navigate to the Next.js project
cd voting-advisor

# Set up environment files
bun run setup-env setup

# Fill in your actual values in .env.local
# Then validate the configuration
bun run validate-env
```

### 2. Get Required API Keys

#### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add it to `.env.local` as `OPENAI_API_KEY`

#### libSQL Setup
1. **For Development**: Use local SQLite file (already configured)
2. **For Production**: Create a Turso database at https://turso.tech
3. Copy your database URL and auth token
4. Add values to `.env.local` as `DATABASE_URL` and `DATABASE_AUTH_TOKEN`

### 3. Validate Configuration
```bash
# Validate your environment setup
bun run validate-env
```

## Security Notes

- **Never commit `.env.local` to version control**
- Use different API keys for development and production
- The `NEXT_PUBLIC_` prefix exposes variables to the browser - only use for non-sensitive config
- Store sensitive keys securely using environment-specific key management
- Regularly rotate API keys for security
- For production, use Turso for hosted libSQL with proper authentication
- Local SQLite files are suitable for development but not production

## Environment-Specific Configurations

### Development Environment
```bash
NODE_ENV=development
USE_MOCK_DATA=true
DEBUG_AI_RESPONSES=true
AI_CONFIDENCE_THRESHOLD=40  # Lower threshold for easier testing
```

### Production Environment
```bash
NODE_ENV=production
USE_MOCK_DATA=false
DEBUG_AI_RESPONSES=false
AI_CONFIDENCE_THRESHOLD=60  # Higher threshold for better accuracy
NEXTAUTH_URL=https://yourdomain.com
```

## Troubleshooting

### Common Issues

1. **"OpenAI API key is missing"**
   - Make sure `OPENAI_API_KEY` is set in `.env.local`
   - Verify the key is valid and has credits

2. **"Database connection failed"**
    - Check that `DATABASE_URL` is set correctly
    - For local development, ensure the SQLite file path is accessible
    - For Turso, verify your auth token is correct

3. **"Environment validation failed"**
   - Run `bun run validate-env` to see specific errors
   - Check that all required variables are set

4. **Build fails with environment errors**
   - Make sure `.env.local` exists and has all required variables
   - Restart the development server after changing environment variables

## Commit Instructions
After setting up environment configuration:
```bash
jj describe -m "Implement environment variables configuration with libSQL/DrizzleORM and validation"
jj new
```