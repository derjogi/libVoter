// Server-only confidence calculation
import type { UserResponse, ConversationMessage } from "@/types";

export interface ConfidenceResult {
  score: number; // 0-100
  factors: {
    responseQuality: number;
    topicCoverage: number;
    consistency: number;
    interactionCount: number;
  };
  reasoning: string;
}

export class ConfidenceCalculator {
  private static readonly TOPICS = [
    "economy",
    "healthcare",
    "education",
    "environment",
    "foreign policy",
    "social issues",
    "taxes",
    "government",
  ];

  static calculate(
    responses: UserResponse[],
    conversationHistory: ConversationMessage[],
  ): ConfidenceResult {
    const factors = {
      responseQuality: this.calculateResponseQuality(responses),
      topicCoverage: this.calculateTopicCoverage(responses),
      consistency: this.calculateConsistency(responses),
      interactionCount: this.calculateInteractionCount(responses),
    };

    // Weighted average calculation
    const score = Math.round(
      factors.responseQuality * 0.3 +
        factors.topicCoverage * 0.3 +
        factors.consistency * 0.2 +
        factors.interactionCount * 0.2,
    );

    const reasoning = this.generateReasoning(factors, score);

    return {
      score: Math.min(100, Math.max(0, score)),
      factors,
      reasoning,
    };
  }

  private static calculateResponseQuality(responses: UserResponse[]): number {
    if (responses.length === 0) return 0;

    let totalQuality = 0;

    for (const response of responses) {
      let quality = 50; // Base quality

      // Check response length (longer = more detailed)
      if (response.value && typeof response.value === "string") {
        const length = response.value.length;
        if (length > 100) quality += 20;
        else if (length > 50) quality += 10;
        else if (length < 10) quality -= 10;
      }

      // Check if user provided confidence rating
      if (response.confidence !== undefined) {
        quality += 10;
      }

      totalQuality += quality;
    }

    return Math.min(100, totalQuality / responses.length);
  }

  private static calculateTopicCoverage(responses: UserResponse[]): number {
    if (responses.length === 0) return 0;

    const coveredTopics = new Set<string>();

    for (const response of responses) {
      const responseText = this.extractTextFromResponse(response);

      for (const topic of this.TOPICS) {
        if (responseText.toLowerCase().includes(topic)) {
          coveredTopics.add(topic);
        }
      }
    }

    const coverageRatio = coveredTopics.size / this.TOPICS.length;
    return Math.round(coverageRatio * 100);
  }

  private static calculateConsistency(responses: UserResponse[]): number {
    if (responses.length < 2) return 50; // Neutral for few responses

    // Simple consistency check - in production, use more sophisticated analysis
    let consistentCount = 0;
    const totalPairs = responses.length - 1;

    for (let i = 0; i < totalPairs; i++) {
      const current = responses[i];
      const next = responses[i + 1];

      // Check if responses are on related topics
      const currentText = this.extractTextFromResponse(current);
      const nextText = this.extractTextFromResponse(next);

      const currentTopics = this.extractTopics(currentText);
      const nextTopics = this.extractTopics(nextText);

      const hasOverlap = currentTopics.some((topic) =>
        nextTopics.includes(topic),
      );

      if (hasOverlap) consistentCount++;
    }

    return Math.round((consistentCount / totalPairs) * 100);
  }

  private static calculateInteractionCount(responses: UserResponse[]): number {
    const count = responses.length;
    const minInteractions = 3; // Minimum for meaningful assessment

    if (count >= minInteractions) return 100;
    return Math.round((count / minInteractions) * 100);
  }

  private static extractTextFromResponse(response: UserResponse): string {
    if (typeof response.value === "string") return response.value;
    if (Array.isArray(response.value)) return response.value.join(" ");
    if (typeof response.value === "object")
      return JSON.stringify(response.value);
    return String(response.value || "");
  }

  private static extractTopics(text: string): string[] {
    const topics: string[] = [];
    const lowerText = text.toLowerCase();

    for (const topic of this.TOPICS) {
      if (lowerText.includes(topic)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  private static generateReasoning(
    factors: ConfidenceResult["factors"],
    score: number,
  ): string {
    const reasons: string[] = [];

    if (factors.responseQuality > 70) {
      reasons.push("User provides detailed, thoughtful responses");
    } else if (factors.responseQuality < 40) {
      reasons.push("Responses are brief or unclear");
    }

    if (factors.topicCoverage > 70) {
      reasons.push("Good coverage of different policy areas");
    } else if (factors.topicCoverage < 40) {
      reasons.push("Limited exploration of policy topics");
    }

    if (factors.consistency > 70) {
      reasons.push("Consistent focus on related topics");
    } else if (factors.consistency < 40) {
      reasons.push("Topics seem disconnected");
    }

    if (factors.interactionCount > 70) {
      reasons.push("Sufficient interaction history");
    } else {
      reasons.push("Need more responses for accurate assessment");
    }

    return reasons.join(". ") + ".";
  }
}
