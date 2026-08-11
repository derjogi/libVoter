// Server-only evidence-retrieval engine (spec 009 Phase 4).
//
// Stage 2 of the two-stage design: given a query (the user's priorities) and a
// structured pre-filter (an electorate's candidate + party ids — Stage 1), it
// returns the most relevant evidence chunks, each carrying its citation. It no
// longer does a per-query LLM-JSON pass or heuristic policy extraction; ranking
// and grounded summaries are layered on top of these chunks (Phases 5/6).

import {
  type EvidenceChunk,
  type EvidenceFilter,
  getVectorStoreManager,
} from "./vector-store";

export type { EvidenceChunk, EvidenceFilter } from "./vector-store";

/** Evidence for one shortlisted candidate, split into track-record vs party. */
export interface CandidateEvidence {
  /** Chunks tagged with this candidate's id. */
  individual: EvidenceChunk[];
  /** Chunks tagged with this candidate's party id. */
  party: EvidenceChunk[];
}

export class RAGQueryEngine {
  /**
   * Retrieve evidence chunks relevant to `query`, restricted to `filter`'s
   * electorate scope. Results are similarity-sorted (closest first).
   */
  async retrieveEvidence(
    query: string,
    filter?: EvidenceFilter,
    maxResults = 8,
  ): Promise<EvidenceChunk[]> {
    const store = await getVectorStoreManager();
    return store.query(query, filter, maxResults);
  }

  /**
   * Retrieve evidence for a single candidate, split into their individual
   * track record vs their party's line (so the UI can show both).
   */
  async retrieveForCandidate(
    query: string,
    identity: {
      personId: string;
      partyId?: string | null;
      electionId: string;
    },
    maxResults = 6,
  ): Promise<CandidateEvidence> {
    const store = await getVectorStoreManager();
    const ids = {
      electionId: identity.electionId,
      candidateIds: [identity.personId],
    };
    const individual = await store.query(query, ids, maxResults);
    const party = identity.partyId
      ? await store.query(
          query,
          {
            electionId: identity.electionId,
            partyIds: [identity.partyId],
          },
          maxResults,
        )
      : [];
    return { individual, party };
  }
}
