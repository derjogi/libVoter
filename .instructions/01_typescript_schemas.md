# TypeScript Schemas and Type System

## Overview
This document defines the core type schemas for the AI voting advisor. The type system is designed to be extensible as new data sources become available, while maintaining compile-time safety throughout the application.

## Dependencies
```bash
# Install required packages
bun add zod @types/node
bun add -d @types/uuid
```

## Implementation Steps

### 1. Create Type Definitions
Create the following files in the Next.js starter template:

**File: `voting-advisor/src/types/index.ts`**
```typescript
// === Core Data Types ===

export interface UserSession {
  id: string;
  data: UserSessionData;
  createdAt: Date;
  lastModified: Date;
}

export interface UserSessionData {
  responses: UserResponse[];
  preferences: UserPreferences;
  conversationHistory: ConversationMessage[];
  currentStep: number;
  confidenceScore: number; // 0-100
}

export interface UserResponse {
  id: string;
  questionId: string;
  componentType: ComponentType;
  value: ResponseValue;
  timestamp: Date;
  confidence?: number; // How confident the user was
}

export type ResponseValue =
  | string
  | number
  | boolean
  | string[]
  | { [key: string]: any };

export interface UserPreferences {
  topics: string[];
  priorities: Record<string, number>; // topic -> priority weight
  stances: Record<string, number>; // stance -> agreement level (-1 to 1)
}

// === Candidate Types ===

export interface Candidate {
  id: string;
  name: string;
  party: string;
  profileData: CandidateProfile;
  createdAt: Date;
}

export interface CandidateProfile {
  // Extensible - can add more fields as data becomes available
  positions: PolicyPosition[];
  biography?: string;
  experience?: string[];
  website?: string;
  socialMedia?: Record<string, string>;
  [key: string]: any; // Allow additional fields for future data
}

export interface PolicyPosition {
  topic: string;
  stance: string;
  details?: string;
  sources?: string[];
  confidence?: number; // How confident we are in this data
}

export interface CandidateMatch {
  candidate: Candidate;
  score: number; // 0-100
  reasoning: string;
  pros: string[];
  cons: string[];
  topMatchingPolicies: string[];
  sources: Source[];
}

export interface Source {
  title: string;
  url: string;
  reliability?: number; // 0-1
  date?: Date;
}

// === UI Component Types ===

export type ComponentType =
  | 'chat'
  | 'yesno'
  | 'multiselect'
  | 'freetext'
  | 'slider';

export interface ComponentData {
  type: ComponentType;
  data: ComponentSpecificData;
}

export type ComponentSpecificData =
  | ChatData
  | YesNoData
  | MultiSelectData
  | FreeTextData
  | SliderData;

export interface ChatData {
  messages: ConversationMessage[];
  placeholder?: string;
}

export interface YesNoData {
  statement: string;
  context?: string;
}

export interface MultiSelectData {
  question: string;
  options: SelectOption[];
  maxSelections?: number;
}

export interface SelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface FreeTextData {
  prompt: string;
  placeholder: string;
  maxLength?: number;
}

export interface SliderData {
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  description?: string;
}

// === Conversation Types ===

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  componentData?: ComponentData;
}

// === API Response Types ===

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fallback?: string;
}

export interface AIResponse {
  response: string;
  nextComponent?: ComponentData;
  candidateMatches?: CandidateMatch[];
  confidence: number;
}

// === Configuration Types ===

export interface AppConfig {
  ai: {
    modelSmall: string;
    modelLarge: string;
    modelReasoning: string;
    temperature: number;
    maxTokens: number;
    confidenceThreshold: number; // AI_CONFIDENCE_THRESHOLD from env
  };
  ui: {
    minInteractionsBeforeResults: number;
    maxCandidatesToShow: number;
    enableLocalStorage: boolean;
    mobileCollapseThreshold: number; // Screen width to trigger mobile layout
  };
  data: {
    maxResponsesPerSession: number;
  };
}

// === Validation Schemas (using Zod) ===

import { z } from 'zod';

export const UserSessionSchema = z.object({
  id: z.string(),
  data: z.object({
    responses: z.array(z.object({
      id: z.string(),
      questionId: z.string(),
      componentType: z.enum(['chat', 'yesno', 'multiselect', 'freetext', 'slider']),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.record(z.any())]),
      timestamp: z.date(),
      confidence: z.number().min(0).max(100).optional()
    })),
    preferences: z.object({
      topics: z.array(z.string()),
      priorities: z.record(z.number()),
      stances: z.record(z.number().min(-1).max(1))
    }),
    conversationHistory: z.array(z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      timestamp: z.date(),
      componentData: z.object({
        type: z.string(),
        data: z.any()
      }).optional()
    })),
    currentStep: z.number(),
    confidenceScore: z.number().min(0).max(100)
  }),
  createdAt: z.date(),
  lastModified: z.date()
});

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  party: z.string(),
  profileData: z.object({
    positions: z.array(z.object({
      topic: z.string(),
      stance: z.string(),
      details: z.string().optional(),
      sources: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).optional()
    })),
    biography: z.string().optional(),
    experience: z.array(z.string()).optional(),
    website: z.string().optional(),
    socialMedia: z.record(z.string()).optional()
  }).catchall(z.any()), // Allow additional fields
  createdAt: z.date()
});
```

### 2. Create Server-Client Separation Structure
Following the rules in `.kilocode/rules/server-client-rules.md`, organize types by their usage context:

**File: `voting-advisor/src/types/server.ts`**
```typescript
// Server-only types (cannot be imported in client components)
export interface ServerConfig {
  openaiApiKey: string;
  libsqlUrl: string;
  libsqlAuthToken?: string;
  chromaUrl: string;
}

export interface DatabaseCandidate {
  id: string;
  name: string;
  party: string;
  profileData: any; // JSON from libSQL
  createdAt: string;
}
```

**File: `voting-advisor/src/types/client.ts`**
```typescript
// Client-safe types (can be imported anywhere)
export interface ClientConfig {
  // No database config needed for client - all DB operations are server-side
}

export interface LocalStorageData {
  sessionId: string;
  userResponses: UserResponse[];
  conversationHistory: ConversationMessage[];
  lastUpdated: Date;
}
```

### 3. Create Utility Types
**File: `voting-advisor/src/types/utils.ts`**
```typescript
// Utility types for common patterns
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Type guards
export function isUserResponse(obj: any): obj is UserResponse {
  return obj && typeof obj.id === 'string' && typeof obj.questionId === 'string';
}

export function isCandidate(obj: any): obj is Candidate {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
}

// Type assertions with validation
export function assertIsUserSession(obj: any): asserts obj is UserSession {
  if (!obj || typeof obj.id !== 'string') {
    throw new Error('Invalid UserSession object');
  }
}
```

## File Organization

### Complete Folder Structure
```
voting-advisor/src/
├── types/
│   ├── index.ts           # Main types export (re-exports all)
│   ├── server.ts          # Server-only types
│   ├── client.ts          # Client-safe types
│   ├── utils.ts           # Utility types and guards
│   ├── api.ts             # API-specific types
│   ├── database.ts        # Database schema types
│   └── components.ts      # UI component types
├── lib/
│   ├── server/            # Server-only utilities
│   │   ├── ai/           # AI processing (server-side only)
│   │   ├── rag/          # RAG system (server-side only)
│   │   └── database.ts   # Database operations
│   ├── client/            # Client-safe utilities
│   │   ├── storage.ts    # Local storage helpers
│   │   ├── api-client.ts # Client API calls
│   │   └── hooks/        # React hooks
│   ├── actions/           # Server Actions
│   ├── prompts/           # AI prompt management
│   └── config.ts          # App configuration
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── dynamic/           # Dynamic AI components
│   └── layout/            # Layout components
└── app/
    ├── layout.tsx         # Root layout
    ├── page.tsx           # Main page
    └── globals.css        # Global styles
```

## Extension Patterns

### Adding New Candidate Data
When new candidate data sources become available, extend types like this:

```typescript
// Method 1: Interface extension
interface ExtendedCandidateProfile extends CandidateProfile {
  votingRecord?: VotingRecord[];
  endorsements?: Endorsement[];
  fundingInfo?: FundingSource[];
}

// Method 2: Module augmentation (preferred for core types)
declare module '@/types' {
  interface CandidateProfile {
    newDataField?: NewDataType;
  }
}
```

### Adding New Component Types
```typescript
// Add to the union type
export type ComponentType =
  | 'chat'
  | 'yesno'
  | 'multiselect'
  | 'freetext'
  | 'slider'
  | 'newComponentType'; // Add new type here

// Add corresponding data interface
export interface NewComponentData {
  // Define properties specific to new component
}

// Update the union
export type ComponentSpecificData =
  | ChatData
  | YesNoData
  | MultiSelectData
  | FreeTextData
  | SliderData
  | NewComponentData; // Add here
```

## Integration Points
- All Server Actions use typed interfaces for input/output
- Database operations are fully typed via DrizzleORM generated types
- React components receive strongly typed props
- AI responses are validated against expected schemas
- User data is stored locally in browser with full type safety
- Client components only import from `types/client.ts` and `types/index.ts`

## Implementation Notes
- Use `strict: true` in `tsconfig.json` to enforce type safety
- Prefer `interface` over `type` for extensibility
- Use `Record<string, T>` for dynamic keys
- Mark uncertain data with `?` for optional fields
- Use union types for component variants
- Export all types from a central `types/index.ts` file
- Use Zod schemas for runtime validation of external data

## Testing the Type System
```typescript
// Example usage in a Server Action
'use server';

import { UserSessionSchema, CandidateSchema } from '@/types';
import { z } from 'zod';

export async function processUserSession(rawData: any) {
  try {
    const validatedData = UserSessionSchema.parse(rawData);
    // Now validatedData is fully typed and validated
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors };
    }
    throw error;
  }
}
```

## Commit Instructions
After implementing the type system:
```bash
jj describe -m "Implement core TypeScript schemas and type system"
jj new
```
