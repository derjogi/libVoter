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

/**
 * The raw, per-type selection captured when a widget is submitted. Stored on a
 * locked {@link TranscriptStep} so the original widget can be re-rendered in a
 * disabled state showing the user's answer — including after a page reload,
 * where component-internal React state would otherwise be lost.
 */
export type RawAnswer =
  | { kind: "dropdown"; id: string; label: string; additionalContext?: string }
  | {
      kind: "multiselect";
      ids: string[];
      labels: string[];
      additionalContext?: string;
    }
  | { kind: "slider"; value: number; additionalContext?: string }
  | {
      kind: "yesno";
      responses: ("agree" | "disagree" | "skip")[];
      additionalContext?: string;
    }
  | { kind: "freetext"; text: string; additionalContext?: string }
  | { kind: "chat"; text: string; additionalContext?: string }
  | {
      kind: "priority";
      rankedIds: string[];
      rankedLabels: string[];
      additionalContext?: string;
    };

/**
 * One row in the chat transcript. The transcript is an ordered list of steps;
 * the last step with `locked === false` is the active question. Once answered a
 * step is `locked` (greyed + disabled), keeps the raw `answer` so its widget can
 * redraw the selection, and carries the derived `response` consumed by the LLM
 * and the right panel.
 */
export interface TranscriptStep {
  id: string;
  component: ComponentData;
  locked: boolean;
  answer?: RawAnswer;
  response?: UserResponse;
}

export interface UserPreferences {
  topics: string[];
  priorities: Record<string, number>; // topic -> priority weight
  stances: Record<string, number>; // stance -> agreement level (-1 to 1)
}

// === Candidate Types ===

/** Serializable candidate model owned by the application boundary. */
export interface Candidate {
  /** @deprecated Use candidacyId. */
  id: string;
  candidacyId: string;
  personId: string;
  partyId: string | null;
  name: string;
  party: string | null;
  seat: string;
  candidate_statement: string | null;
  key_positions: Record<string, string> | null;
  why: string | null;
  key_skills: string | null;
  top_issues: string | null;
  supporting_links: string[] | null;
  photo_url: string | null;
  created_at: Date;
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
  candidateSources: Source[];
  partySources: Source[];
  candidateEvidenceStatus: EvidenceStatus;
  partyEvidenceStatus: EvidenceStatus;
  /** @deprecated Use the provenance-specific source arrays. */
  sources?: Source[];
}

export type EvidenceStatus = "available" | "empty" | "unavailable";

export interface Source {
  title: string;
  url: string;
  reliability?: number; // 0-1
  date?: Date;
  evidenceId?: string;
  excerpt?: string;
}

// === Party Types (spec 019: MMP party-vote lane) ===

/**
 * Lightweight, serializable view of an `election_parties` row, used by the
 * party-vote panel. Deliberately a plain shape (not the Drizzle row) so it
 * crosses the Server Action boundary without carrying Date / JSON columns.
 */
export interface PartySummary {
  id: string;
  name: string;
  leader: string | null;
}

/**
 * A ranked party for the MMP **party vote**, parallel to {@link CandidateMatch}
 * for the electorate vote. Kept as a separate list so party and candidate
 * scores are never conflated. Evidence-backed citations (`sources`) are
 * populated later by spec 009; party ranking starts heuristic/LLM-backed.
 */
export interface PartyMatch {
  party: PartySummary;
  score: number; // 0-100
  reasoning: string;
  topMatchingPolicies: string[];
  sources: Source[];
  evidenceStatus: EvidenceStatus;
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
  PriorityRankingData,
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
  PriorityRankingData,
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
          "priority",
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
  party: z.string().nullable(),
  seat: z.string(),
  candidate_statement: z.string().nullable(),
  key_positions: z.record(z.string(), z.string()).nullable(),
  why: z.string().nullable(),
  key_skills: z.string().nullable(),
  top_issues: z.string().nullable(),
  supporting_links: z.array(z.string()).nullable(),
  photo_url: z.string().nullable(),
  created_at: z.date(),
});
