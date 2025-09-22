'use server';

import { RAGQueryEngine, type RAGContext } from '@/lib/server/rag/query-engine';
import { getCandidatesByIds } from '@/lib/actions/database';
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
        rankedCandidates: [],
        relevantPolicies: [],
        sources: []
      }
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
        rankedCandidates: context.rankedCandidates,
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