// Server-only: Cannot be imported in client components.
//
// Evidence-retrieval vector store (spec 009 Phase 4). Indexes *chunks* of the
// `evidence_sources` table — each chunk carries metadata (candidate_id,
// party_id, source_type, source_url, …) so retrieval can be restricted to one
// electorate's candidates + their parties and every chunk can be cited and
// expanded. This is NOT used to pick candidates (that is a structured SQL
// filter); it answers "what does this candidate / party believe or do?".

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { electionConfig } from "../../config/election";
import { evidenceSources, hansardUtterances } from "../../db/schema";
import type { EmbeddingModel } from "../ai/model-factory";
import { createEmbeddingModel, isMockMode } from "../ai/model-factory";
import { db } from "../db";

export function collectionNameForElection(electionId: string): string {
  return `election-${electionId}`;
}

const DEFAULT_COLLECTION = electionConfig.evidence.electionCollection;
const REFERENCE_COLLECTION = "reference-nz-parliament";

/** Structured pre-filter applied to the vector search (Stage 1 → Stage 2). */
export interface EvidenceFilter {
  electionId?: string;
  /** Restrict to evidence for these candidates (soft ids). */
  candidateIds?: string[];
  /** …and/or these parties. */
  partyIds?: string[];
  sourceTypes?: string[];
}

/** A retrieved evidence chunk with everything needed to cite + expand it. */
export interface EvidenceChunk {
  content: string;
  /** Similarity in (0,1], higher = closer. */
  score: number;
  candidateId?: string;
  partyId?: string;
  sourceType: string;
  sourceUrl?: string;
  sourceTitle?: string;
  date?: string;
  electionId?: string;
  evidenceId?: string;
  documentType?: string;
  speaker?: string;
  role?: string;
  utteranceSequence?: number;
}

export interface EvidenceVectorStore {
  query(
    text: string,
    filter?: EvidenceFilter,
    maxResults?: number,
  ): Promise<EvidenceChunk[]>;
  populate(): Promise<number>;
  repopulate(): Promise<number>;
}

/**
 * Chroma distance → similarity. Chroma's `similaritySearchWithScore` returns a
 * *distance* (lower = closer); the old code treated it as a similarity and
 * sorted descending, inverting every ranking. `1/(1+distance)` is monotonically
 * decreasing in distance, so higher always means closer regardless of metric.
 */
export function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return 1 / (1 + distance);
}

/**
 * Translate an EvidenceFilter into a Chroma `where` clause. Candidate/party
 * scoping is an OR (a chunk matches if it belongs to one of the electorate's
 * candidates OR one of their parties). Returns undefined when there is nothing
 * to filter on.
 */
export function buildWhereFilter(
  filter?: EvidenceFilter,
): Record<string, unknown> | undefined {
  if (!filter) return undefined;
  const clauses: Record<string, unknown>[] = [];

  if (filter.electionId) clauses.push({ election_id: filter.electionId });

  if (filter.sourceTypes && filter.sourceTypes.length > 0) {
    clauses.push({ source_type: { $in: filter.sourceTypes } });
  }

  const idClauses: Record<string, unknown>[] = [];
  if (filter.candidateIds && filter.candidateIds.length > 0) {
    idClauses.push({ candidate_id: { $in: filter.candidateIds } });
  }
  if (filter.partyIds && filter.partyIds.length > 0) {
    idClauses.push({ party_id: { $in: filter.partyIds } });
  }
  if (idClauses.length === 1) clauses.push(idClauses[0]);
  else if (idClauses.length > 1) clauses.push({ $or: idClauses });

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

type ChromaFactory = (index?: Chroma["index"]) => Chroma;

interface VectorStoreInitOptions {
  /**
   * When true, seed the collection from libSQL if it exists but is empty.
   * App runtime should leave this off; offline embedding scripts can opt in.
   */
  seedIfEmpty?: boolean;
}

interface VectorStoreManagerOptions {
  collectionName?: string;
}

export { REFERENCE_COLLECTION };

function chromaDbConfig(index?: Chroma["index"]) {
  if (index) return { index };

  const url = new URL(process.env.CHROMA_URL || "http://localhost:8000");
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    ssl: url.protocol === "https:",
  };
}

export class VectorStoreManager implements EvidenceVectorStore {
  private vectorStore: Chroma | null = null;
  private embeddings: EmbeddingModel;
  private createVectorStore: ChromaFactory;
  private collectionName: string;

  constructor(
    embeddings: EmbeddingModel = createEmbeddingModel(),
    createVectorStore?: ChromaFactory,
    options: VectorStoreManagerOptions = {},
  ) {
    this.embeddings = embeddings;
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION;
    this.createVectorStore =
      createVectorStore ??
      ((index) =>
        new Chroma(this.embeddings, {
          collectionName: this.collectionName,
          ...chromaDbConfig(index),
        }));
  }

  async initialize({ seedIfEmpty = false }: VectorStoreInitOptions = {}) {
    try {
      this.vectorStore = await Chroma.fromExistingCollection(this.embeddings, {
        collectionName: this.collectionName,
        ...chromaDbConfig(),
      });
      const count = await this.vectorStore.collection?.count();
      if (count) {
        console.log(`✅ Loaded evidence vector store (${count} chunks)`);
        return;
      }
      console.log("📝 Evidence vector store is empty.");
      if (seedIfEmpty) {
        console.log("📝 Seeding evidence vector store from libSQL…");
        await this.populate();
      }
    } catch {
      console.log(
        "📝 Evidence collection not found, creating empty collection…",
      );
      this.vectorStore = this.createVectorStore();
      await this.vectorStore.ensureCollection();
      if (seedIfEmpty) {
        console.log("📝 Seeding evidence vector store from libSQL…");
        await this.populate();
      }
    }
  }

  async populate(): Promise<number> {
    if (!this.vectorStore) {
      this.vectorStore = this.createVectorStore();
    }

    const rows = await db.select().from(evidenceSources).all();
    const utteranceRows = await db.select().from(hansardUtterances).all();
    const utterancesByEvidence = new Map<string, typeof utteranceRows>();
    for (const utterance of utteranceRows) {
      const list = utterancesByEvidence.get(utterance.evidenceSourceId) ?? [];
      list.push(utterance);
      utterancesByEvidence.set(utterance.evidenceSourceId, list);
    }
    for (const list of utterancesByEvidence.values()) {
      list.sort((a, b) => a.sequence - b.sequence);
    }
    console.log(`📊 ${rows.length} evidence sources from DB`);

    const docs = rows
      .filter((r) => r.content?.trim())
      .flatMap((r) => {
        const baseMetadata = {
          evidence_id: r.id,
          election_id: str(r.electionId),
          candidate_id: str(r.candidateId),
          party_id: str(r.partyId),
          source_type: str(r.sourceType),
          source_url: str(r.url),
          source_title: str(r.title),
          date: r.publishedAt ? new Date(r.publishedAt).toISOString() : "",
          document_type: str(r.documentType),
        };
        const utterances = utterancesByEvidence.get(r.id) ?? [];
        if (utterances.length > 0) {
          return utterances.map((utterance, index) => {
            const previous = utterances[index - 1];
            const next = utterances[index + 1];
            const pageContent = [
              previous
                ? `[previous: ${previous.speakerName ?? "unknown"}] ${previous.text}`
                : undefined,
              `[current: ${utterance.speakerName ?? "unknown"}] ${utterance.text}`,
              next
                ? `[next: ${next.speakerName ?? "unknown"}] ${next.text}`
                : undefined,
            ]
              .filter(Boolean)
              .join("\n\n");
            return new Document({
              pageContent,
              metadata: {
                ...baseMetadata,
                speaker: str(utterance.speakerName),
                role: str(utterance.speakerRole),
                utterance_sequence: utterance.sequence,
              },
            });
          });
        }
        return [
          new Document({
            pageContent: r.content,
            metadata: {
              ...baseMetadata,
              speaker: str(r.author),
              role: str(r.documentType),
              utterance_sequence: 0,
            },
          }),
        ];
      });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(docs);
    console.log(`📄 Split ${docs.length} sources into ${chunks.length} chunks`);

    const BATCH = 100;
    let added = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      try {
        await this.vectorStore.addDocuments(batch);
        added += batch.length;
        console.log(`  ✅ ${added}/${chunks.length}`);
      } catch (err) {
        console.error(`  ❌ batch at ${i} failed:`, err);
      }
    }
    return added;
  }

  /** Replace the derived evidence index with a fresh collection. */
  async reset(): Promise<void> {
    if (!this.vectorStore) {
      this.vectorStore = this.createVectorStore();
    }
    await this.vectorStore.ensureCollection();
    const client = this.vectorStore.index;
    if (!client) {
      throw new Error("Chroma client unavailable while resetting evidence");
    }

    await client.deleteCollection({ name: this.collectionName });
    // The old LangChain wrapper caches the deleted Collection handle.
    this.vectorStore = this.createVectorStore(client);
  }

  async repopulate(): Promise<number> {
    await this.reset();
    return this.populate();
  }

  async query(
    text: string,
    filter?: EvidenceFilter,
    maxResults = 8,
  ): Promise<EvidenceChunk[]> {
    if (!this.vectorStore) throw new Error("Vector store not initialized");
    const where = buildWhereFilter(filter);
    const results = await this.vectorStore.similaritySearchWithScore(
      text,
      maxResults,
      // Chroma's typed `Where` doesn't model our $and/$or/$in composition;
      // the runtime accepts it, so cast.
      where as Parameters<Chroma["similaritySearchWithScore"]>[2],
    );
    return results
      .map(([doc, distance]) => ({
        content: doc.pageContent,
        score: distanceToSimilarity(distance),
        candidateId: doc.metadata.candidate_id || undefined,
        partyId: doc.metadata.party_id || undefined,
        sourceType: String(doc.metadata.source_type || ""),
        sourceUrl: doc.metadata.source_url || undefined,
        sourceTitle: doc.metadata.source_title || undefined,
        date: doc.metadata.date || undefined,
        electionId: doc.metadata.election_id || undefined,
        evidenceId: doc.metadata.evidence_id || undefined,
        documentType: doc.metadata.document_type || undefined,
        speaker: doc.metadata.speaker || undefined,
        role: doc.metadata.role || undefined,
        utteranceSequence:
          typeof doc.metadata.utterance_sequence === "number" &&
          doc.metadata.utterance_sequence > 0
            ? doc.metadata.utterance_sequence
            : undefined,
      }))
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * In-memory mock used when AI_MODE=mock. Honours the election/party filter so
 * tests can assert electorate scoping without Chroma or embeddings.
 */
class MockVectorStoreManager implements EvidenceVectorStore {
  private fixtures: EvidenceChunk[] = [
    {
      content:
        "ACT supports lower taxes, deregulation and choice in education. Classical-liberal platform.",
      score: 0.92,
      partyId: "nz-2026-party-act",
      sourceType: "party_policy",
      sourceUrl: "https://en.wikipedia.org/wiki/ACT_New_Zealand",
      sourceTitle: "ACT — party platform (Wikipedia)",
      electionId: "nz-2026",
    },
    {
      content:
        "The Green Party prioritises climate action, public transport and affordable housing.",
      score: 0.88,
      partyId: "nz-2026-party-green",
      sourceType: "party_policy",
      sourceUrl:
        "https://en.wikipedia.org/wiki/Green_Party_of_Aotearoa_New_Zealand",
      sourceTitle: "Green — party platform (Wikipedia)",
      electionId: "nz-2026",
    },
    {
      content:
        "Labour focuses on health funding, workers' rights and cost-of-living support.",
      score: 0.81,
      partyId: "nz-2026-party-labour",
      sourceType: "party_policy",
      sourceUrl: "https://en.wikipedia.org/wiki/New_Zealand_Labour_Party",
      sourceTitle: "Labour — party platform (Wikipedia)",
      electionId: "nz-2026",
    },
  ];

  async populate(): Promise<number> {
    return this.fixtures.length;
  }

  async repopulate(): Promise<number> {
    return this.populate();
  }

  async query(
    _text: string,
    filter?: EvidenceFilter,
    maxResults = 8,
  ): Promise<EvidenceChunk[]> {
    let out = this.fixtures;
    if (filter?.electionId) {
      out = out.filter((c) => c.electionId === filter.electionId);
    }
    if (filter?.partyIds?.length || filter?.candidateIds?.length) {
      const parties = new Set(filter.partyIds ?? []);
      const cands = new Set(filter.candidateIds ?? []);
      out = out.filter(
        (c) =>
          (c.partyId && parties.has(c.partyId)) ||
          (c.candidateId && cands.has(c.candidateId)),
      );
    }
    if (filter?.sourceTypes?.length) {
      const types = new Set(filter.sourceTypes);
      out = out.filter((c) => types.has(c.sourceType));
    }
    return out.slice(0, maxResults);
  }
}

let vectorStoreManager: EvidenceVectorStore | null = null;
let vectorStoreManagerPromise: Promise<EvidenceVectorStore> | null = null;

export async function getVectorStoreManager(): Promise<EvidenceVectorStore> {
  if (vectorStoreManager) return vectorStoreManager;
  if (vectorStoreManagerPromise) return vectorStoreManagerPromise;

  vectorStoreManagerPromise = (async () => {
    if (isMockMode()) {
      console.log("AI_MODE=mock — using MockVectorStoreManager");
      return new MockVectorStoreManager();
    }

    console.log("Creating VectorStoreManager (evidence)");
    const real = new VectorStoreManager();
    await real.initialize();
    return real;
  })()
    .then((manager) => {
      vectorStoreManager = manager;
      return manager;
    })
    .finally(() => {
      vectorStoreManagerPromise = null;
    });

  return vectorStoreManagerPromise;
}
