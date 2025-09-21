// Server-only RAG query engine
import { getVectorStoreManager } from './vector-store';
import { createChatModel } from '@/lib/server/ai/model-factory';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import type { Candidate, PolicyPosition } from '@/types';
import type { ChatModel } from '@/lib/server/ai/model-factory';

export interface RAGContext {
  candidates: Candidate[];
  relevantPolicies: PolicyPosition[];
  sources: string[];
}

export class RAGQueryEngine {
  chatModel: ChatModel;

  constructor() {
    this.chatModel = createChatModel(); // Default model
  }

  async queryWithContext(question: string, userContext?: string): Promise<RAGContext> {
    const vectorStore = await getVectorStoreManager();
    const relevantDocs = await vectorStore.query(question, 10);

    // Extract candidate and policy information from relevant documents
    const candidates = this.extractCandidatesFromDocs(relevantDocs);
    const policies = this.extractPoliciesFromDocs(relevantDocs);

    // Generate contextual response
    const contextPrompt = `
Based on the following relevant information about candidates and their policies:

${relevantDocs.map(doc => doc.content).join('\n\n')}

${userContext ? `User context: ${userContext}` : ''}

Question: ${question}

Please provide:
1. List of relevant candidates with their key positions
2. Specific policy details that address the question
3. Sources for the information

Format as JSON with candidates, policies, and sources arrays.
`;
    console.log("RAG query started")
    console.time('RAG Query ChatModel Invoke');
    const response = await this.chatModel.invoke([
      { role: 'system', content: 'You are a political analysis expert. Provide accurate, neutral information.' },
      { role: 'user', content: contextPrompt }
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
    console.timeEnd("RAG Query ChatModel Invoke");

    try {
      const parsed = JSON.parse(response.content as string);
      return {
        candidates: parsed.candidates || candidates,
        relevantPolicies: parsed.policies || policies,
        sources: parsed.sources || relevantDocs.map(doc => doc.metadata.source || 'Unknown')
      };
    } catch (error) {
      // Fallback if JSON parsing fails
      return {
        candidates,
        relevantPolicies: policies,
        sources: relevantDocs.map(doc => doc.metadata.source || 'Unknown')
      };
    }
  }

  private extractCandidatesFromDocs(docs: any[]): Candidate[] {
    // Extract candidate information from document content
    const candidates: Candidate[] = [];

    for (const doc of docs) {
      const content = doc.content.toLowerCase();

      // Simple extraction - in production, use more sophisticated NLP
      if (content.includes('candidate') || content.includes('running for')) {
        // This is a simplified extraction - you'd want more robust parsing
        const candidate: Candidate = {
          id: `candidate_${candidates.length}`,
          name: this.extractName(content),
          party: this.extractParty(content),
          profileData: {
            positions: [],
            biography: doc.content.substring(0, 200) + '...'
          },
          createdAt: new Date()
        };
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private extractPoliciesFromDocs(docs: any[]): PolicyPosition[] {
    // Extract policy positions from documents
    const policies: PolicyPosition[] = [];

    for (const doc of docs) {
      // Simple policy extraction - enhance with better NLP in production
      const content = doc.content;
      const policyKeywords = ['policy', 'position', 'stance', 'supports', 'opposes'];

      for (const keyword of policyKeywords) {
        if (content.toLowerCase().includes(keyword)) {
          policies.push({
            topic: this.extractTopic(content),
            stance: this.extractStance(content),
            details: content.substring(0, 300) + '...',
            sources: [doc.metadata.source || 'Unknown']
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
      /Candidate ([A-Z][a-z]+)/g    // Candidate Name
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match) return match[0];
    }

    return 'Unknown Candidate';
  }

  private extractParty(content: string): string {
    // Simple party extraction
    const parties = ['Democratic', 'Republican', 'Independent', 'Green', 'Libertarian'];

    for (const party of parties) {
      if (content.includes(party)) return party;
    }

    return 'Independent';
  }

  private extractTopic(content: string): string {
    // Simple topic extraction
    const topics = ['economy', 'healthcare', 'education', 'environment', 'foreign policy'];

    for (const topic of topics) {
      if (content.toLowerCase().includes(topic)) return topic;
    }

    return 'General Policy';
  }

  private extractStance(content: string): string {
    // Simple stance extraction
    if (content.toLowerCase().includes('support')) return 'Supports';
    if (content.toLowerCase().includes('oppos')) return 'Opposes';
    if (content.toLowerCase().includes('favor')) return 'Favors';

    return 'Neutral';
  }
}