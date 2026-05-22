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
  /** The question text as shown to the user when they answered this step. */
  question?: string;
  /** Full component data snapshot so the history panel can re-render the
   *  original question (options, labels, etc.) without reconstructing it. */
  componentData?: ComponentData;
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
import { Candidate } from "@/lib/db/schema";

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
// The single source of truth is `src/types/components.zod.ts` — the Zod
// schemas there are used both to validate LLM-generated component specs and
// to drive the React renderer. Re-exported here so existing imports from
// `@/types` keep working.

import type {
  ChatData,
  ComponentData,
  ComponentType,
  DropdownData,
  FreeTextData,
  MultiSelectData,
  SelectOption,
  SliderData,
  YesNoData,
} from "./components.zod";

export type {
  ChatData,
  ComponentData,
  ComponentType,
  DropdownData,
  FreeTextData,
  MultiSelectData,
  SelectOption,
  SliderData,
  YesNoData,
};

// Convenience alias for the data union (the second positional in
// `ComponentData`). Prefer narrowing via `componentData.type` over reaching
// for this directly.
export type ComponentSpecificData = ComponentData["data"];

// === Conversation Types ===

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
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

import { z } from "zod";

export const UserSessionSchema = z.object({
  id: z.string(),
  data: z.object({
    responses: z.array(
      z.object({
        id: z.string(),
        questionId: z.string(),
        componentType: z.enum([
          "chat",
          "yesno",
          "multiselect",
          "dropdown",
          "freetext",
          "slider",
        ]),
        value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.string()),
          z.record(z.any(), z.any()),
        ]),
        /** Optional question text stored alongside the response for history display. */
        question: z.string().optional(),
        /** Optional component data snapshot for rich history rendering. */
        componentData: z
          .object({
            type: z.string(),
            data: z.any(),
          })
          .optional(),
        timestamp: z.date(),
        confidence: z.number().min(0).max(100).optional(),
      }),
    ),
    preferences: z.object({
      topics: z.array(z.string()),
      priorities: z.record(z.string(), z.number()),
      stances: z.record(z.string(), z.number().min(-1).max(1)),
    }),
    conversationHistory: z.array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.date(),
        componentData: z
          .object({
            type: z.string(),
            data: z.any(),
          })
          .optional(),
      }),
    ),
    currentStep: z.number(),
    confidenceScore: z.number().min(0).max(100),
  }),
  createdAt: z.date(),
  lastModified: z.date(),
});

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  party: z.string(),
  profileData: z
    .object({
      positions: z.array(
        z.object({
          topic: z.string(),
          stance: z.string(),
          details: z.string().optional(),
          sources: z.array(z.string()).optional(),
          confidence: z.number().min(0).max(1).optional(),
        }),
      ),
      biography: z.string().optional(),
      experience: z.array(z.string()).optional(),
      website: z.string().optional(),
      socialMedia: z.record(z.string(), z.string()).optional(),
    })
    .catchall(z.any()), // Allow additional fields
  createdAt: z.date(),
});
