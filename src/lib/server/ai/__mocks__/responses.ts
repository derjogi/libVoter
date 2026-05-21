// Deterministic mock responses for AI_MODE=mock. The mock chat model
// inspects the user message for one of these prompt IDs and returns the
// matching JSON string. The fixtures must satisfy the Zod schemas in
// src/types/components.zod.ts.

export const MOCK_RESPONSES: Record<string, string> = {
  COMPONENT_SELECTOR: JSON.stringify({
    type: "multiselect",
    reasoning: "mock — pick top issues",
    data: {
      question: "Which issues matter most to you?",
      options: [
        {
          id: "housing",
          label: "Housing",
          description: "Affordable housing and rent",
        },
        {
          id: "transport",
          label: "Transport",
          description: "Public transport and roads",
        },
        {
          id: "climate",
          label: "Climate",
          description: "Climate change response",
        },
        {
          id: "health",
          label: "Health",
          description: "Healthcare and hospitals",
        },
      ],
      maxSelections: 3,
    },
  }),

  NEXT_QUESTION_GENERAL: JSON.stringify({
    question: "How important is climate policy to you in this election?",
    type: "chat",
    context: "mock — explore climate stance",
  }),

  FOLLOWUP_QUESTION: JSON.stringify({
    question: "Could you say a bit more about why that matters to you?",
    type: "chat",
    reasoning: "mock followup",
  }),

  EXPLAIN_MATCH:
    "Mock explanation: this candidate aligns closely with your stated values on housing and transport.",

  SUMMARIZE_PREFERENCES:
    "Mock summary: you prioritise housing affordability, public transport, and a strong climate response.",

  TAG_TOPICS: JSON.stringify(["housing", "transport"]),

  CANDIDATE_MATCHING: JSON.stringify([
    {
      id: "mock-1",
      score: 78,
      reasoning: "mock high alignment",
      topMatches: ["housing", "transport"],
      concerns: [],
    },
  ]),
};

/**
 * Pick the right mock response by sniffing the prompt content for a marker
 * substring. Falls back to a generic chat response.
 */
export function pickMockResponse(promptText: string): string {
  // Heuristic: each prompt template has a distinctive phrase we can match on.
  if (
    promptText.includes(
      "Available component types and their EXACT data structures",
    )
  ) {
    return MOCK_RESPONSES.COMPONENT_SELECTOR;
  }
  if (promptText.includes("Generate a thoughtful follow-up question")) {
    return MOCK_RESPONSES.FOLLOWUP_QUESTION;
  }
  if (promptText.includes("Generate the most valuable next question")) {
    return MOCK_RESPONSES.NEXT_QUESTION_GENERAL;
  }
  if (promptText.includes("Provide a clear, balanced explanation")) {
    return MOCK_RESPONSES.EXPLAIN_MATCH;
  }
  if (promptText.includes("Summarize the user's political preferences")) {
    return MOCK_RESPONSES.SUMMARIZE_PREFERENCES;
  }
  if (promptText.includes("Calculate match scores")) {
    return MOCK_RESPONSES.CANDIDATE_MATCHING;
  }
  // Default: a friendly chat reply.
  return "Mock chat reply. Tell me what matters to you most.";
}
