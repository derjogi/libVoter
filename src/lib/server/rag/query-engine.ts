// Server-only evidence-retrieval engine (spec 009 Phase 4).
//
// Stage 2 of the two-stage design: given a query (the user's priorities) and a
// structured pre-filter (an electorate's candidate + party ids — Stage 1), it
// returns the most relevant evidence chunks, each carrying its citation. It no
// longer does a per-query LLM-JSON pass or heuristic policy extraction; ranking
// and grounded summaries are layered on top of these chunks (Phases 5/6).

import type { EvidenceStatus } from "@/types";
import {
  type EvidenceChunk,
  type EvidenceFilter,
  getVectorStoreManager,
} from "./vector-store";

export type { EvidenceChunk, EvidenceFilter } from "./vector-store";

/** Evidence for one shortlisted candidate, split into track-record vs party. */
export interface CandidateEvidence {
  /** Chunks tagged with this candidate's id. */
  individual: EvidenceResult;
  /** Chunks tagged with this candidate's party id. */
  party: EvidenceResult;
}

export interface EvidenceResult {
  status: EvidenceStatus;
  data: EvidenceChunk[];
}

export class RAGQueryEngine {
  constructor(
    private readonly loadStore: typeof getVectorStoreManager = getVectorStoreManager,
  ) {}

  private async settle(
    query: Promise<EvidenceChunk[]>,
  ): Promise<EvidenceResult> {
    try {
      const data = await query;
      return { status: data.length > 0 ? "available" : "empty", data };
    } catch {
      return { status: "unavailable", data: [] };
    }
  }
  /**
   * Retrieve evidence chunks relevant to `query`, restricted to `filter`'s
   * electorate scope. Results are similarity-sorted (closest first).
   */
  async retrieveEvidence(
    query: string,
    filter?: EvidenceFilter,
    maxResults = 8,
  ): Promise<EvidenceChunk[]> {
    const store = await this.loadStore();
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
    let store: Awaited<ReturnType<typeof getVectorStoreManager>>;
    try {
      store = await this.loadStore();
    } catch {
      const unavailable: EvidenceResult = { status: "unavailable", data: [] };
      return {
        individual: unavailable,
        party: identity.partyId ? unavailable : { status: "empty", data: [] },
      };
    }
    const ids = {
      electionId: identity.electionId,
      candidateIds: [identity.personId],
    };
    const [individual, party] = await Promise.all([
      this.settle(store.query(query, ids, maxResults)),
      identity.partyId
        ? this.settle(
            store.query(
              query,
              {
                electionId: identity.electionId,
                partyIds: [identity.partyId],
              },
              maxResults,
            ),
          )
        : Promise.resolve({ status: "empty", data: [] } as EvidenceResult),
    ]);
    return { individual, party };
  }

  async retrieveForParty(
    query: string,
    partyId: string,
    electionId: string,
    maxResults = 6,
  ): Promise<EvidenceResult> {
    try {
      const store = await this.loadStore();
      return this.settle(
        store.query(query, { electionId, partyIds: [partyId] }, maxResults),
      );
    } catch {
      return { status: "unavailable", data: [] };
    }
  }
}
