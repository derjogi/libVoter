# AI Prompt Library and Management

## Overview
This document defines the infrastructure for managing AI prompts in a scalable, maintainable way. The prompt library supports dynamic variables, categorization, and easy modification without code changes. All prompt operations are server-side only for security.

## Dependencies
```bash
# No additional dependencies needed - uses existing LangChain setup
```

## Implementation Steps

### 1. Create Server-Only Prompt Infrastructure
Following server-client separation rules, all prompt management must be server-side:

**File: `voting-advisor/src/lib/server/prompts/index.ts`**
```typescript
// Server-only: Cannot be imported in client components
export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  category: 'matching' | 'question_generation' | 'component_selection' | 'analysis';
  description?: string;
  version?: string;
  tags?: string[];
}

export interface FormattedPrompt {
  content: string;
  metadata: {
    templateId: string;
    variables: Record<string, any>;
    timestamp: Date;
    version?: string;
  };
}

export interface PromptValidationResult {
  isValid: boolean;
  missingVariables: string[];
  errors: string[];
}

// Core prompt templates - server-side only
export const PROMPTS: Record<string, PromptTemplate> = {
  // Candidate matching prompts
  CANDIDATE_MATCHING: {
    id: 'candidate_matching',
    name: 'Candidate Matching Algorithm',
    category: 'matching',
    template: `You are an AI political advisor helping users find candidates that match their preferences.

User Responses Summary:
{userResponses}

Available Candidates:
{candidates}

Task: Calculate match scores (0-100) for each candidate based on policy alignment with user preferences.

Consider:
- Policy position alignment
- Importance weighting of different topics
- User's stated priorities
- Consistency of candidate positions

Return ONLY a JSON array in this exact format:
[
  {
    "id": "candidate_id",
    "score": 85,
    "reasoning": "Brief explanation of why this score",
    "topMatches": ["policy1", "policy2", "policy3"],
    "concerns": ["potential issue1", "potential issue2"]
  }
]`,
    variables: ['userResponses', 'candidates'],
    description: 'Calculates compatibility scores between user preferences and candidates',
    version: '1.0',
    tags: ['matching', 'scoring', 'candidates']
  },

  // Question generation prompts
  NEXT_QUESTION_GENERAL: {
    id: 'next_question_general',
    name: 'Generate Next Question - General',
    category: 'question_generation',
    template: `You are guiding a user through discovering their political preferences.

Previous conversation:
{conversationHistory}

Current user preferences discovered:
{currentPreferences}

Target question type: {questionType}

Generate the most valuable next question to understand their political stance better.

Consider:
- What important topics haven't been covered yet
- Follow up on interesting responses from previous questions
- Balance broad topics with specific policy details
- Keep questions neutral and unbiased

Return JSON format:
{
  "question": "The actual question text",
  "type": "{questionType}",
  "context": "Why this question is important",
  "options": ["option1", "option2"] // if applicable
}`,
    variables: ['conversationHistory', 'currentPreferences', 'questionType'],
    description: 'Generates contextually relevant questions based on conversation history',
    version: '1.0',
    tags: ['questions', 'generation', 'contextual']
  },

  FOLLOWUP_QUESTION: {
    id: 'followup_question',
    name: 'Generate Follow-up Question',
    category: 'question_generation',
    template: `Based on the user's last response: "{lastResponse}"

Generate a thoughtful follow-up question that:
- Digs deeper into their reasoning
- Explores related aspects of the topic
- Helps clarify their position
- Maintains conversational flow

Previous context: {context}

Return JSON format:
{
  "question": "Follow-up question text",
  "type": "chat",
  "reasoning": "Why this follow-up is valuable"
}`,
    variables: ['lastResponse', 'context'],
    description: 'Creates deeper follow-up questions based on user responses',
    version: '1.0',
    tags: ['followup', 'questions', 'deepening']
  },

  // Component selection prompts
  COMPONENT_SELECTOR: {
    id: 'component_selector',
    name: 'Select Next UI Component',
    category: 'component_selection',
    template: `Analyze the conversation state and determine the best UI component for the next interaction.

Current conversation state:
{conversationState}

Available components:
- chat: Open conversation, good for nuanced topics
- yesno: Binary choices, good for clear stances
- multiselect: Multiple choice, good for priorities
- freetext: Detailed input, good for complex opinions
- swipe: Quick judgments, good for many statements
- slider: Quantitative input, good for budget/priority allocation

Consider:
- User engagement level
- Complexity of next topic
- Variety in interaction types used so far
- User's response patterns

Return JSON format:
{
  "component": "component_name",
  "reasoning": "Why this component fits best",
  "data": {
    // Component-specific configuration
  }
}`,
    variables: ['conversationState'],
    description: 'Determines optimal UI component for next user interaction',
    version: '1.0',
    tags: ['ui', 'components', 'selection']
  },

  // Analysis and explanation prompts
  EXPLAIN_MATCH: {
    id: 'explain_match',
    name: 'Explain Candidate Match',
    category: 'analysis',
    template: `Provide a clear, balanced explanation of why a candidate matches a user's preferences.

User Profile:
{userProfile}

Candidate Information:
{candidateInfo}

Match Score: {matchScore}%

Create an explanation that:
- Highlights the strongest alignment areas
- Acknowledges any potential concerns or misalignments
- Provides specific policy examples
- Remains balanced and informative
- Avoids political bias

Format as conversational explanation, not a list.`,
    variables: ['userProfile', 'candidateInfo', 'matchScore'],
    description: 'Generates human-readable explanations for candidate matches',
    version: '1.0',
    tags: ['explanation', 'analysis', 'matches']
  },

  SUMMARIZE_PREFERENCES: {
    id: 'summarize_preferences',
    name: 'Summarize User Preferences',
    category: 'analysis',
    template: `Summarize the user's political preferences based on their responses.

User responses:
{allResponses}

Create a clear, organized summary that includes:
- Top 3-5 priority issues for this user
- Their general political leanings (if discernible)
- Any interesting or nuanced positions
- Areas where they seem undecided

Keep it neutral and descriptive, not prescriptive.`,
    variables: ['allResponses'],
    description: 'Creates readable summaries of user political preferences',
    version: '1.0',
    tags: ['summary', 'analysis', 'preferences']
  }
};

export function getPrompt(id: keyof typeof PROMPTS): PromptTemplate {
  const prompt = PROMPTS[id];
  if (!prompt) {
    throw new Error(`Prompt with ID '${id}' not found`);
  }
  return prompt;
}

export function getPromptsByCategory(category: PromptTemplate['category']): PromptTemplate[] {
  return Object.values(PROMPTS).filter(prompt => prompt.category === category);
}

export function getPromptsByTag(tag: string): PromptTemplate[] {
  return Object.values(PROMPTS).filter(prompt => prompt.tags?.includes(tag));
}

export function formatPrompt(
  template: PromptTemplate,
  variables: Record<string, any>
): FormattedPrompt {
  const validation = validatePromptVariables(template, variables);
  if (!validation.isValid) {
    throw new Error(`Missing required variables: ${validation.missingVariables.join(', ')}`);
  }

  let formatted = template.template;

  template.variables.forEach(variable => {
    const value = variables[variable];
    if (value === undefined || value === null) {
      console.warn(`Variable '${variable}' is undefined/null in prompt '${template.id}'`);
    }

    // Handle different value types
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (typeof value === 'object') {
      stringValue = JSON.stringify(value, null, 2);
    } else {
      stringValue = String(value || '');
    }

    formatted = formatted.replace(
      new RegExp(`\\{${variable}\\}`, 'g'),
      stringValue
    );
  });

  return {
    content: formatted,
    metadata: {
      templateId: template.id,
      variables,
      timestamp: new Date(),
      version: template.version
    }
  };
}

export function validatePromptVariables(
  template: PromptTemplate,
  variables: Record<string, any>
): PromptValidationResult {
  const missingVariables = template.variables.filter(variable =>
    variables[variable] === undefined
  );

  const errors: string[] = [];
  if (missingVariables.length > 0) {
    errors.push(`Missing required variables: ${missingVariables.join(', ')}`);
  }

  // Check for type issues
  template.variables.forEach(variable => {
    const value = variables[variable];
    if (value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
      // Objects should be serializable
      try {
        JSON.stringify(value);
      } catch (e) {
        errors.push(`Variable '${variable}' contains non-serializable data`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    missingVariables,
    errors
  };
}

export function getPromptStats() {
  const categories = Object.values(PROMPTS).reduce((acc, prompt) => {
    acc[prompt.category] = (acc[prompt.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const tags = Object.values(PROMPTS).reduce((acc, prompt) => {
    prompt.tags?.forEach(tag => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  return {
    total: Object.keys(PROMPTS).length,
    categories,
    tags
  };
}
```

### 2. Create Prompt Manager Class
**File: `voting-advisor/src/lib/server/prompts/manager.ts`**
```typescript
// Server-only prompt manager
import { ChatOpenAI } from '@langchain/openai';
import { getPrompt, formatPrompt, type PromptTemplate } from './index';
import type { ConversationMessage, UserResponse } from '@/types';

export interface PromptExecutionResult {
  success: boolean;
  response?: any;
  error?: string;
  metadata: {
    promptId: string;
    executionTime: number;
    tokensUsed?: number;
    model: string;
  };
}

export class PromptManager {
  private chatModel: ChatOpenAI;

  constructor() {
    this.chatModel = new ChatOpenAI({
      modelName: process.env.AI_MODEL_LARGE || 'gpt-4',
      temperature: 0.3, // Lower temperature for more consistent results
      maxTokens: 2000,
      openAIApiKey: process.env.OPENAI_API_KEY!
    });
  }

  async executePrompt(
    promptId: keyof typeof import('./index').PROMPTS,
    variables: Record<string, any>
  ): Promise<PromptExecutionResult> {
    const startTime = Date.now();

    try {
      const template = getPrompt(promptId);
      const formatted = formatPrompt(template, variables);

      const response = await this.chatModel.call([
        { role: 'system', content: 'You are a helpful AI assistant. Provide accurate, neutral responses.' },
        { role: 'user', content: formatted.content }
      ]);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        response: response.content,
        metadata: {
          promptId: template.id,
          executionTime,
          tokensUsed: this.estimateTokens(formatted.content + response.content),
          model: this.chatModel.modelName
        }
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`Prompt execution failed for ${promptId}:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          promptId,
          executionTime,
          model: this.chatModel.modelName
        }
      };
    }
  }

  async generateNextQuestion(
    conversationHistory: ConversationMessage[],
    userResponses: UserResponse[],
    questionType: string = 'chat'
  ): Promise<PromptExecutionResult> {
    const conversationText = conversationHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const preferences = this.extractPreferences(userResponses);

    return this.executePrompt('NEXT_QUESTION_GENERAL', {
      conversationHistory: conversationText,
      currentPreferences: preferences,
      questionType
    });
  }

  async generateFollowupQuestion(
    lastResponse: string,
    context: string
  ): Promise<PromptExecutionResult> {
    return this.executePrompt('FOLLOWUP_QUESTION', {
      lastResponse,
      context
    });
  }

  async selectComponent(
    conversationState: string
  ): Promise<PromptExecutionResult> {
    return this.executePrompt('COMPONENT_SELECTOR', {
      conversationState
    });
  }

  async explainMatch(
    userProfile: string,
    candidateInfo: string,
    matchScore: number
  ): Promise<PromptExecutionResult> {
    return this.executePrompt('EXPLAIN_MATCH', {
      userProfile,
      candidateInfo,
      matchScore
    });
  }

  async summarizePreferences(
    allResponses: UserResponse[]
  ): Promise<PromptExecutionResult> {
    const responsesText = allResponses
      .map(r => `${r.questionId}: ${r.value}`)
      .join('\n');

    return this.executePrompt('SUMMARIZE_PREFERENCES', {
      allResponses: responsesText
    });
  }

  private extractPreferences(responses: UserResponse[]): string {
    // Simple preference extraction - enhance with more sophisticated analysis
    const topics = new Set<string>();

    responses.forEach(response => {
      const text = this.extractTextFromResponse(response);
      const lowerText = text.toLowerCase();

      // Extract common political topics
      const topicKeywords = [
        'economy', 'healthcare', 'education', 'environment',
        'taxes', 'immigration', 'foreign policy', 'social security'
      ];

      topicKeywords.forEach(topic => {
        if (lowerText.includes(topic)) {
          topics.add(topic);
        }
      });
    });

    return Array.from(topics).join(', ') || 'No clear preferences identified yet';
  }

  private extractTextFromResponse(response: UserResponse): string {
    if (typeof response.value === 'string') return response.value;
    if (Array.isArray(response.value)) return response.value.join(' ');
    if (typeof response.value === 'object') return JSON.stringify(response.value);
    return String(response.value || '');
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
let promptManager: PromptManager | null = null;

export function getPromptManager(): PromptManager {
  if (!promptManager) {
    promptManager = new PromptManager();
  }
  return promptManager;
}
```

### 3. Create Server Actions for Prompt Operations
**File: `voting-advisor/src/lib/actions/prompts.ts`**
```typescript
'use server';

import { getPromptManager } from '@/lib/server/prompts/manager';
import type { ConversationMessage, UserResponse } from '@/types';

export async function generateNextQuestion(
  conversationHistory: ConversationMessage[],
  userResponses: UserResponse[],
  questionType: string = 'chat'
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateNextQuestion(conversationHistory, userResponses, questionType);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: 'What are your thoughts on current political issues?',
          type: 'chat',
          context: 'General political discussion'
        }
      };
    }

    // Parse the JSON response
    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      // If JSON parsing fails, return a fallback
      return {
        success: false,
        error: 'Failed to parse AI response',
        fallback: {
          question: result.response, // Use raw response as question
          type: questionType,
          context: 'AI-generated question'
        }
      };
    }
  } catch (error) {
    console.error('Question generation failed:', error);
    return {
      success: false,
      error: 'Failed to generate question',
      fallback: {
        question: 'What political topics interest you most?',
        type: 'chat',
        context: 'Fallback question'
      }
    };
  }
}

export async function generateFollowupQuestion(
  lastResponse: string,
  context: string
) {
  try {
    const manager = getPromptManager();
    const result = await manager.generateFollowupQuestion(lastResponse, context);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          question: 'Can you tell me more about that?',
          type: 'chat',
          reasoning: 'Follow-up to previous response'
        }
      };
    }

    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse followup response',
        fallback: {
          question: result.response,
          type: 'chat',
          reasoning: 'AI-generated followup'
        }
      };
    }
  } catch (error) {
    console.error('Followup generation failed:', error);
    return {
      success: false,
      error: 'Failed to generate followup',
      fallback: {
        question: 'Can you elaborate on your previous answer?',
        type: 'chat',
        reasoning: 'Fallback followup'
      }
    };
  }
}

export async function selectNextComponent(
  conversationState: string
) {
  try {
    const manager = getPromptManager();
    const result = await manager.selectComponent(conversationState);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        fallback: {
          component: 'chat',
          reasoning: 'Default to chat interface',
          data: { placeholder: 'Continue the conversation...' }
        }
      };
    }

    try {
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        data: parsed,
        metadata: result.metadata
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse component selection',
        fallback: {
          component: 'chat',
          reasoning: 'Fallback to chat',
          data: { placeholder: 'What would you like to discuss?' }
        }
      };
    }
  } catch (error) {
    console.error('Component selection failed:', error);
    return {
      success: false,
      error: 'Failed to select component',
      fallback: {
        component: 'chat',
        reasoning: 'Error fallback',
        data: { placeholder: 'Please continue...' }
      }
    };
  }
}

export async function explainCandidateMatch(
  userProfile: string,
  candidateInfo: string,
  matchScore: number
) {
  try {
    const manager = getPromptManager();
    const result = await manager.explainMatch(userProfile, candidateInfo, matchScore);

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Match explanation failed:', error);
    return {
      success: false,
      error: 'Failed to generate explanation',
      data: 'This candidate appears to align with your stated preferences.'
    };
  }
}

export async function summarizeUserPreferences(
  userResponses: UserResponse[]
) {
  try {
    const manager = getPromptManager();
    const result = await manager.summarizePreferences(userResponses);

    return {
      success: result.success,
      data: result.success ? result.response : null,
      error: result.error,
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Preference summarization failed:', error);
    return {
      success: false,
      error: 'Failed to summarize preferences',
      data: 'Based on your responses, you have shown interest in various political topics.'
    };
  }
}
```

### 4. Create Client Hook for Prompt Operations
**File: `voting-advisor/src/lib/client/hooks/usePrompts.ts`**
```typescript
'use client';

import { useState } from 'react';

export function usePromptActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuestion = async (
    conversationHistory: any[],
    userResponses: any[],
    questionType: string = 'chat'
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/prompts/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory,
          userResponses,
          questionType
        })
      });

      const result = await response.json();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const explainMatch = async (
    userProfile: string,
    candidateInfo: string,
    matchScore: number
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/prompts/explain-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile,
          candidateInfo,
          matchScore
        })
      });

      const result = await response.json();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    generateQuestion,
    explainMatch,
    loading,
    error
  };
}
```

## Usage Patterns

### In Server Actions
```typescript
// lib/actions/chat.ts
'use server';

import { generateNextQuestion, explainCandidateMatch } from '@/lib/actions/prompts';

export async function processChatMessage(message: string, history: any[]) {
  // Generate next question
  const questionResult = await generateNextQuestion(history, [], 'chat');

  // Explain candidate match
  const explanationResult = await explainCandidateMatch(
    'User prefers healthcare reform',
    'Candidate supports universal healthcare',
    85
  );

  return {
    question: questionResult.data,
    explanation: explanationResult.data
  };
}
```

### In React Components
```typescript
// components/ChatComponent.tsx
'use client';

import { usePromptActions } from '@/lib/client/hooks/usePrompts';

export function ChatComponent() {
  const { generateQuestion, loading, error } = usePromptActions();

  const handleGenerateQuestion = async () => {
    const result = await generateQuestion(history, responses, 'yesno');
    if (result.success) {
      setCurrentQuestion(result.data);
    }
  };

  return (
    <div>
      {loading && <p>Generating question...</p>}
      {error && <p>Error: {error}</p>}
      <button onClick={handleGenerateQuestion}>
        Generate Next Question
      </button>
    </div>
  );
}
```

## Prompt Development Guidelines

### Writing Effective Prompts
1. **Be specific**: Clear instructions produce better results
2. **Use examples**: Show the AI exactly what format you want
3. **Handle edge cases**: Account for unusual or missing data
4. **Stay neutral**: Avoid political bias in question framing
5. **Test variations**: A/B test different prompt versions

### Variable Naming
- Use `camelCase` for variable names
- Be descriptive: `userResponses` not `data`
- Group related variables: `candidateInfo`, `candidateProfile`
- Use consistent naming across prompts

### Prompt Categories
- `matching`: Calculate compatibility scores
- `question_generation`: Create new questions for users
- `component_selection`: Choose UI components
- `analysis`: Explain results and summarize data

## Extension and Customization

### Adding New Prompts
```typescript
// Add to PROMPTS object in index.ts
NEW_PROMPT_ID: {
  id: 'new_prompt_id',
  name: 'Descriptive Name',
  category: 'appropriate_category',
  template: `Your prompt template with {variables}`,
  variables: ['variable1', 'variable2'],
  description: 'What this prompt does',
  version: '1.0',
  tags: ['new', 'feature']
}
```

### Dynamic Prompt Loading
For future enhancement, prompts could be loaded from a database:
```typescript
export async function getPromptFromDB(id: string): Promise<PromptTemplate> {
  const { data } = await supabaseServer
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .single();

  return data;
}
```

## Integration Points
- Used by AI chat system for conversation flow
- Integrated with candidate matching algorithm
- Supports dynamic UI component selection
- Feeds into analytics for prompt effectiveness tracking
- All operations are server-side only for security

## Performance Considerations
- Cache formatted prompts when variables don't change
- Validate variables before formatting to catch errors early
- Keep templates under reasonable size limits for API calls
- Log prompt usage for optimization insights
- Singleton pattern for prompt manager

## Testing the Prompt System

### 1. Test Prompt Execution
```typescript
import { getPromptManager } from '@/lib/server/prompts/manager';

const manager = getPromptManager();
const result = await manager.executePrompt('SUMMARIZE_PREFERENCES', {
  allResponses: 'User supports healthcare reform and education funding'
});

console.log('Result:', result);
```

### 2. Test Server Actions
```typescript
const questionResult = await generateNextQuestion([], [], 'chat');
console.log('Generated question:', questionResult.data?.question);
```

## Commit Instructions
After implementing the AI prompt library:
```bash
jj describe -m "Implement AI prompt library with server-side management and dynamic templates"
jj new
```
