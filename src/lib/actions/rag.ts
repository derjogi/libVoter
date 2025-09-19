'use server';

import { RAGQueryEngine, type RAGContext } from '@/lib/server/rag/query-engine';
import type { Candidate, PolicyPosition } from '@/types';

let ragEngine: RAGQueryEngine | null = null;

async function getRAGEngine() {
  if (!ragEngine) {
    ragEngine = new RAGQueryEngine();
  }
  return ragEngine;
}

export async function queryRAGContext(question: string, userContext?: string) {
  try {
    const engine = await getRAGEngine();
    const context = await engine.queryWithContext(question, userContext);

    return {
      success: true,
      data: context
    };
  } catch (error) {
    console.error('RAG query failed:', error, (await getRAGEngine()).chatModel.model);
    return {
      success: false,
      error: 'Failed to query knowledge base',
      fallback: {
        candidates: [],
        relevantPolicies: [],
        sources: []
      }
    };
  }
}

export async function getCandidateContext(candidateId: string) {
  try {
    const engine = await getRAGEngine();

    // Query for specific candidate information
    const context = await engine.queryWithContext(
      `Tell me about candidate with ID ${candidateId}`,
      'Looking for detailed candidate information'
    );

    // Find the specific candidate
    const candidate = context.candidates.find(c => c.id === candidateId);

    if (!candidate) {
      return {
        success: false,
        error: 'Candidate not found'
      };
    }

    return {
      success: true,
      data: {
        candidate,
        relatedPolicies: context.relevantPolicies,
        sources: context.sources
      }
    };
  } catch (error) {
    console.error('Candidate context query failed:', error);
    return {
      success: false,
      error: 'Failed to get candidate information'
    };
  }
}

export async function searchPolicies(topic: string) {
  try {
    const engine = await getRAGEngine();
    const context = await engine.queryWithContext(
      `What are the positions on ${topic}?`,
      `Searching for policy positions related to ${topic}`
    );

    return {
      success: true,
      data: {
        policies: context.relevantPolicies,
        candidates: context.candidates,
        sources: context.sources
      }
    };
  } catch (error) {
    console.error('Policy search failed:', error);
    return {
      success: false,
      error: 'Failed to search policies'
    };
  }
}