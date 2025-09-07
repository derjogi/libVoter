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
    id: "candidate_matching",
    name: "Candidate Matching Algorithm",
    category: "matching",
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
    variables: ["userResponses", "candidates"],
    description:
      "Calculates compatibility scores between user preferences and candidates",
    version: "1.0",
    tags: ["matching", "scoring", "candidates"],
  },

  // Question generation prompts
  NEXT_QUESTION_GENERAL: {
    id: "next_question_general",
    name: "Generate Next Question - General",
    category: "question_generation",
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
    variables: ["conversationHistory", "currentPreferences", "questionType"],
    description:
      "Generates contextually relevant questions based on conversation history",
    version: "1.0",
    tags: ["questions", "generation", "contextual"],
  },

  FOLLOWUP_QUESTION: {
    id: "followup_question",
    name: "Generate Follow-up Question",
    category: "question_generation",
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
    variables: ["lastResponse", "context"],
    description: "Creates deeper follow-up questions based on user responses",
    version: "1.0",
    tags: ["followup", "questions", "deepening"],
  },

  // Component selection prompts
  COMPONENT_SELECTOR: {
    id: "component_selector",
    name: "Select Next UI Component with Data Generation",
    category: "component_selection",
    template: `Analyze the conversation state and determine the best UI component for the next interaction.

Current conversation state:
{conversationState}

Available component types and their EXACT data structures:

1. chat: Continue conversational interaction
   Data structure: { "messages": ConversationMessage[], "placeholder": string }

2. yesno: Ask a yes/no question about a specific statement
   Data structure: { "statement": string, "context": string }

3. multiselect: Allow user to select multiple options from a list
   Data structure: {
     "question": string,
     "options": [{ "id": string, "label": string, "description": string }],
     "maxSelections": number
   }

4. freetext: Ask for open-ended text response
   Data structure: { "prompt": string, "placeholder": string, "maxLength": number }

5. slider: Use a slider for quantitative responses
   Data structure: {
     "label": string,
     "min": number,
     "max": number,
     "step": number,
     "unit": string,
     "description": string
   }

Consider:
- User engagement level and conversation flow
- Complexity of next topic to explore
- Variety in interaction types used so far
- User's response patterns and depth of answers
- What would most effectively narrow down their political preferences

Your task: Choose the most appropriate next component type and generate the specific data for that component using the EXACT structure specified above.

Return JSON format:
{
  "component": "chat|yesno|multiselect|freetext|slider",
  "reasoning": "Why this component fits best for narrowing preferences",
  "data": {
    // Use the exact structure for the chosen component type - no extra fields
  }
}

Guidelines for data generation:
- multiselect: Generate up to 10 options with unique IDs (e.g., "opt_1", "opt_2"), labels, and descriptions
- yesno: Generate up to 10 relevant political statements with unique IDs (e.g., "stmt_1", "stmt_2")
- slider: Set appropriate min/max values (e.g., 0-10 for agreement levels, 0-100 for percentages), include unit and description
- chat: Use empty messages array and a relevant placeholder text
- freetext: Include a clear prompt, placeholder text, and optional maxLength`,
    variables: ["conversationState"],
    description:
      "Determines optimal UI component for next user interaction and generates component data",
    version: "1.0",
    tags: ["ui", "components", "selection", "data-generation"],
  },

  // Analysis and explanation prompts
  EXPLAIN_MATCH: {
    id: "explain_match",
    name: "Explain Candidate Match",
    category: "analysis",
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
    variables: ["userProfile", "candidateInfo", "matchScore"],
    description: "Generates human-readable explanations for candidate matches",
    version: "1.0",
    tags: ["explanation", "analysis", "matches"],
  },

  SUMMARIZE_PREFERENCES: {
    id: "summarize_preferences",
    name: "Summarize User Preferences",
    category: "analysis",
    template: `Summarize the user's political preferences based on their responses.

User responses:
{allResponses}

Create a clear, organized summary that includes:
- Top 3-5 priority issues for this user
- Their general political leanings (if discernible)
- Any interesting or nuanced positions
- Areas where they seem undecided

Keep it neutral and descriptive, not prescriptive.`,
    variables: ["allResponses"],
    description: "Creates readable summaries of user political preferences",
    version: "1.0",
    tags: ["summary", "analysis", "preferences"],
  },
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