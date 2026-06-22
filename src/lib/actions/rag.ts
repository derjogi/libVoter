"use server";

import { RAGQueryEngine } from "@/lib/server/rag/query-engine";
import type { EvidenceFilter } from "@/lib/server/rag/vector-store";

let ragEngine: RAGQueryEngine | null = null;

function getRAGEngine() {
  if (!ragEngine) ragEngine = new RAGQueryEngine();
  return ragEngine;
}

/**
 * Retrieve electorate-scoped evidence chunks (with citations) relevant to the
 * user's query. `filter` carries the Stage-1 candidate/party ids.
 */
export async function retrieveEvidence(
  query: string,
  filter?: EvidenceFilter,
  maxResults = 8,
) {
  try {
    const chunks = await getRAGEngine().retrieveEvidence(
      query,
      filter,
      maxResults,
    );
    return { success: true, data: { chunks } };
  } catch (error) {
    console.error("Evidence retrieval failed:", error);
    return {
      success: false,
      error: "Failed to retrieve evidence",
      data: { chunks: [] },
    };
  }
}

/** Evidence for one candidate, split into individual track record vs party line. */
export async function retrieveCandidateEvidence(
  query: string,
  candidateId: string,
  partyId: string | undefined,
  electionId: string,
) {
  try {
    const data = await getRAGEngine().retrieveForCandidate(
      query,
      candidateId,
      partyId,
      electionId,
    );
    return { success: true, data };
  } catch (error) {
    console.error("Candidate evidence retrieval failed:", error);
    return {
      success: false,
      error: "Failed to retrieve candidate evidence",
      data: { individual: [], party: [] },
    };
  }
}
