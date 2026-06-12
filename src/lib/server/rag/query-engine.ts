// Server-only RAG query engine
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { getVectorStoreManager } from "./vector-store";
import { createChatModel } from "@/lib/server/ai/model-factory";
import type { PolicyPosition } from "@/types";
import type { ChatModel } from "@/lib/server/ai/model-factory";
import { parseRAGResponse } from "@/types/components.zod";

export interface RankedCandidate {
  candidateId: string;
  similarityScore: number;
  relevanceScore: number;
  matchedContent: string;
}

export interface RAGContext {
  rankedCandidates: RankedCandidate[];
  relevantPolicies: PolicyPosition[];
  sources: string[];
}

export class RAGQueryEngine {
  chatModel: ChatModel;

  constructor() {
    this.chatModel = createChatModel(); // Default model
  }

  async queryWithContext(
    question: string,
    userContext?: string,
  ): Promise<RAGContext> {
    const vectorStore = await getVectorStoreManager();
    const relevantDocs = await vectorStore.query(question, 10);

    // Extract policy information from relevant documents (candidates will be fetched from DB using IDs)
    const policies = this.extractPoliciesFromDocs(relevantDocs);

    // Generate ranked candidates based on semantic similarity (returns candidate IDs)
    const rankedCandidates = this.rankCandidatesBySemanticSimilarity(
      relevantDocs,
      question,
      userContext,
    );

    // Generate contextual response
    const contextPrompt = `
Based on the following relevant information about candidates and their policies:

${relevantDocs.map((doc) => doc.content).join("\n\n")}

${userContext ? `User context: ${userContext}` : ""}

Question: ${question}

Please provide:
1. List of relevant candidates with their key positions
2. Specific policy details that address the question
3. Sources for the information

Format as JSON with candidates, policies, and sources arrays.
`;
    console.log("RAG query started for contextPrompt: \n\n", contextPrompt);
    console.time("Time for: RAG Query ChatModel Invoke");
    const response = await this.chatModel.invoke([
      new SystemMessage({
        content:
          "You are a political analysis expert. Provide accurate, neutral information.",
      }),
      new HumanMessage({ content: contextPrompt }),
    ]);

    // const response: BaseMessage = new AIMessage(JSON.stringify({
    //   candidates: [
    //     {
    //       id: "1",
    //       name: "John",
    //       party: "Red",
    //       profileData: {
    //         positions: [
    //           {
    //             topic: "This",
    //             stance: "that",
    //           }
    //         ],
    //       },
    //       createdAt: Date.now(),
    //     }
    //   ],
    //   policies: [],
    //   sources: []
    // }));
    console.timeEnd("Time for: RAG Query ChatModel Invoke");

    const validated = parseRAGResponse(response.content as string);
    if (validated) {
      console.debug("RAG response (validated): \n\n", validated);
      return {
        rankedCandidates,
        relevantPolicies:
          validated.policies.length > 0 ? validated.policies : policies,
        sources:
          validated.sources.length > 0
            ? validated.sources
            : relevantDocs.map((doc) => doc.metadata.source || "Unknown"),
      };
    }

    // Validation failed (bad JSON or schema mismatch) — fall back to the
    // heuristic-extracted policies + raw doc sources.
    console.warn(
      "RAG response failed validation; falling back to heuristic extraction",
    );
    return {
      rankedCandidates,
      relevantPolicies: policies,
      sources: relevantDocs.map((doc) => doc.metadata.source || "Unknown"),
    };
  }

  private extractPoliciesFromDocs(docs: any[]): PolicyPosition[] {
    // Extract policy positions from documents
    const policies: PolicyPosition[] = [];

    for (const doc of docs) {
      // Simple policy extraction - enhance with better NLP in production
      const content = doc.content;
      const policyKeywords = [
        "policy",
        "position",
        "stance",
        "supports",
        "opposes",
      ];

      for (const keyword of policyKeywords) {
        if (content.toLowerCase().includes(keyword)) {
          policies.push({
            topic: this.extractTopic(content),
            stance: this.extractStance(content),
            details: content.substring(0, 300) + "...",
            sources: [doc.metadata.source || "Unknown"],
          });
          break;
        }
      }
    }

    return policies;
  }

  private extractName(content: string): string {
    // Simple name extraction - enhance with NLP in production
    const namePatterns = [
      /([A-Z][a-z]+ [A-Z][a-z]+)/g, // First Last
      /Candidate ([A-Z][a-z]+)/g, // Candidate Name
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match) return match[0];
    }

    return "Unknown Candidate";
  }

  private extractParty(content: string): string {
    // Simple party extraction
    const parties = [
      "Democratic",
      "Republican",
      "Independent",
      "Green",
      "Libertarian",
    ];

    for (const party of parties) {
      if (content.includes(party)) return party;
    }

    return "Independent";
  }

  private extractTopic(content: string): string {
    // Simple topic extraction
    const topics = [
      "economy",
      "healthcare",
      "education",
      "environment",
      "foreign policy",
    ];

    for (const topic of topics) {
      if (content.toLowerCase().includes(topic)) return topic;
    }

    return "General Policy";
  }

  private extractStance(content: string): string {
    // Simple stance extraction
    if (content.toLowerCase().includes("support")) return "Supports";
    if (content.toLowerCase().includes("oppos")) return "Opposes";
    if (content.toLowerCase().includes("favor")) return "Favors";

    return "Neutral";
  }

  private rankCandidatesBySemanticSimilarity(
    docs: any[],
    question: string,
    userContext?: string,
  ): RankedCandidate[] {
    const rankedCandidates: RankedCandidate[] = [];

    // Group documents by candidate ID to aggregate scores
    const candidateDocs = new Map<
      string,
      { docs: any[]; totalScore: number; content: string[] }
    >();

    for (const doc of docs) {
      const candidateId = doc.metadata.id;
      if (!candidateId) continue;

      if (!candidateDocs.has(candidateId)) {
        candidateDocs.set(candidateId, {
          docs: [],
          totalScore: 0,
          content: [],
        });
      }

      const candidateData = candidateDocs.get(candidateId)!;
      candidateData.docs.push(doc);
      candidateData.totalScore += doc.score || 0;
      candidateData.content.push(doc.content);
    }

    // Create ranked candidates from aggregated data
    for (const [candidateId, data] of candidateDocs.entries()) {
      // Calculate relevance score based on similarity and content quality
      const similarityScore = data.totalScore / data.docs.length; // Average similarity score
      const relevanceScore = this.calculateRelevanceScore(
        similarityScore,
        data.content.join(" "),
        question,
        userContext,
      );

      rankedCandidates.push({
        candidateId: candidateId,
        similarityScore,
        relevanceScore,
        matchedContent:
          data.content.slice(0, 3).join(" ").substring(0, 500) + "...", // Top 3 matches, truncated
      });
    }

    // Sort by relevance score (highest first)
    return rankedCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private calculateRelevanceScore(
    similarityScore: number,
    content: string,
    question: string,
    userContext?: string,
  ): number {
    let score = similarityScore;

    // Boost score based on content quality indicators
    const qualityIndicators = [
      "policy",
      "position",
      "stance",
      "candidate",
      "election",
      "experience",
      "background",
      "statement",
      "platform",
    ];

    let qualityBoost = 0;
    for (const indicator of qualityIndicators) {
      if (content.toLowerCase().includes(indicator)) {
        qualityBoost += 0.1;
      }
    }
    score += Math.min(qualityBoost, 0.5); // Cap quality boost

    // Boost score if content directly addresses question keywords
    const questionWords = question.toLowerCase().split(/\s+/);
    let questionMatchBoost = 0;
    for (const word of questionWords) {
      if (word.length > 3 && content.toLowerCase().includes(word)) {
        questionMatchBoost += 0.05;
      }
    }
    score += Math.min(questionMatchBoost, 0.3); // Cap question match boost

    // Consider user context if provided
    if (userContext) {
      const contextWords = userContext.toLowerCase().split(/\s+/);
      let contextMatchBoost = 0;
      for (const word of contextWords) {
        if (word.length > 3 && content.toLowerCase().includes(word)) {
          contextMatchBoost += 0.02;
        }
      }
      score += Math.min(contextMatchBoost, 0.2); // Cap context match boost
    }

    // Normalize to 0-1 range
    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Get prioritized candidate lists based on semantic similarity to user queries
   * Returns candidates ranked by relevance alongside relevant policy information
   */
  async getPrioritizedCandidates(
    question: string,
    userContext?: string,
    maxCandidates: number = 5,
  ): Promise<{
    prioritizedCandidates: RankedCandidate[];
    relevantPolicies: PolicyPosition[];
    sources: string[];
  }> {
    const vectorStore = await getVectorStoreManager();
    const relevantDocs = await vectorStore.query(
      question,
      Math.max(maxCandidates * 2, 10),
    ); // Get more docs for better ranking

    // Generate ranked candidates
    const rankedCandidates = this.rankCandidatesBySemanticSimilarity(
      relevantDocs,
      question,
      userContext,
    );

    // Extract relevant policies from top-ranked candidate documents
    const topCandidateDocs = rankedCandidates
      .slice(0, maxCandidates)
      .flatMap((rc) => rc.matchedContent.split("...")[0]) // Get content snippets
      .join(" ");

    const policies = this.extractPoliciesFromText(topCandidateDocs, question);

    return {
      prioritizedCandidates: rankedCandidates.slice(0, maxCandidates),
      relevantPolicies: policies,
      sources: relevantDocs
        .map((doc) => doc.metadata.source || "Unknown")
        .filter((s, i, arr) => arr.indexOf(s) === i), // Unique sources
    };
  }

  private extractPoliciesFromText(
    text: string,
    question: string,
  ): PolicyPosition[] {
    const policies: PolicyPosition[] = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      const policyKeywords = [
        "policy",
        "position",
        "stance",
        "supports",
        "opposes",
        "favors",
        "believes",
      ];
      const hasPolicyKeyword = policyKeywords.some((keyword) =>
        sentence.toLowerCase().includes(keyword),
      );

      if (hasPolicyKeyword) {
        const topic =
          this.extractTopic(sentence) || this.inferTopicFromQuestion(question);
        const stance = this.extractStance(sentence);

        // Avoid duplicates
        const existingPolicy = policies.find(
          (p) => p.topic === topic && p.stance === stance,
        );
        if (!existingPolicy) {
          policies.push({
            topic,
            stance,
            details: sentence.trim(),
            sources: ["RAG Analysis"],
          });
        }
      }
    }

    return policies.slice(0, 5); // Limit to top 5 policies
  }

  private inferTopicFromQuestion(question: string): string {
    const topicKeywords = {
      economy: [
        "economy",
        "economic",
        "jobs",
        "employment",
        "tax",
        "budget",
        "finance",
      ],
      healthcare: ["health", "medical", "hospital", "doctor", "insurance"],
      education: ["education", "school", "student", "teacher", "learning"],
      environment: [
        "environment",
        "climate",
        "green",
        "sustainability",
        "pollution",
      ],
      housing: ["housing", "home", "rent", "property", "affordable"],
      transportation: [
        "transport",
        "traffic",
        "road",
        "public transit",
        "bike",
      ],
      social: ["social", "equality", "justice", "rights", "community"],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (
        keywords.some((keyword) => question.toLowerCase().includes(keyword))
      ) {
        return topic.charAt(0).toUpperCase() + topic.slice(1);
      }
    }

    return "General Policy";
  }
}
