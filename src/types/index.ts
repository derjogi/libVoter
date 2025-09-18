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
  | 'dropdown'
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
  | DropdownData
  | FreeTextData
  | SliderData;

export interface ChatData {
  messages: ConversationMessage[];
  placeholder?: string;
}

export interface YesNoData {
  statements: Array<{
    statement: string;
    context?: string;
  }>;
}

export interface MultiSelectData {
  question: string;
  options: SelectOption[];
  maxSelections?: number;
  questionId?: string;
}

export interface DropdownData {
  question: string;
  options: SelectOption[];
  placeholder?: string;
  questionId?: string;
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
      componentType: z.enum(['chat', 'yesno', 'multiselect', 'dropdown', 'freetext', 'slider']),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.record(z.any(), z.any())]),
      timestamp: z.date(),
      confidence: z.number().min(0).max(100).optional()
    })),
    preferences: z.object({
      topics: z.array(z.string()),
      priorities: z.record(z.string(), z.number()),
      stances: z.record(z.string(), z.number().min(-1).max(1))
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
    socialMedia: z.record(z.string(), z.string()).optional()
  }).catchall(z.any()), // Allow additional fields
  createdAt: z.date()
});