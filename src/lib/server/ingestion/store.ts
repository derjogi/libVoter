// Evidence persistence port (spec 010).
//
// The runner writes through this small interface so it can be unit-tested with
// an in-memory fake (no SQLite) while production uses the Drizzle-backed
// implementation. Dedup/change-detection lives in the runner; the store just
// provides the lookups it needs plus insert/update.

import { and, eq } from "drizzle-orm";
import { evidenceSources, type NewEvidenceSource } from "../../db/schema";
import type { db as DbType } from "../db";

export interface ExistingEvidence {
  id: string;
  contentHash: string | null;
  sourceType: NewEvidenceSource["sourceType"];
  title: string | null;
  url: string | null;
  author: string | null;
  publishedAt: Date | null;
  documentType: string | null;
  sourceStatus: string | null;
  parliamentNumber: number | null;
}

function existingEvidence(row: NewEvidenceSource): ExistingEvidence {
  return {
    id: row.id as string,
    contentHash: row.contentHash ?? null,
    sourceType: row.sourceType,
    title: row.title ?? null,
    url: row.url ?? null,
    author: row.author ?? null,
    publishedAt: row.publishedAt ?? null,
    documentType: row.documentType ?? null,
    sourceStatus: row.sourceStatus ?? null,
    parliamentNumber: row.parliamentNumber ?? null,
  };
}

export interface EvidenceStore {
  /** Existing row id whose contentHash exactly matches, else null. */
  findByHash(hash: string): Promise<string | null>;
  /** Existing row for the same stable source-system document identity. */
  findByExternalId(
    sourceAdapter: string,
    externalId: string,
  ): Promise<ExistingEvidence | null>;
  /** Existing row for the same source URL + identity (for change detection). */
  findByUrl(
    url: string,
    candidateId?: string,
    partyId?: string,
  ): Promise<ExistingEvidence | null>;
  insert(row: NewEvidenceSource): Promise<void>;
  update(id: string, row: Partial<NewEvidenceSource>): Promise<void>;
}

/** In-memory store, used by tests and `--dry-run`. */
export class InMemoryEvidenceStore implements EvidenceStore {
  rows: NewEvidenceSource[] = [];

  async findByHash(hash: string): Promise<string | null> {
    const hit = this.rows.find((r) => r.contentHash === hash);
    return hit ? (hit.id as string) : null;
  }

  async findByExternalId(
    sourceAdapter: string,
    externalId: string,
  ): Promise<ExistingEvidence | null> {
    const hit = this.rows.find(
      (r) => r.sourceAdapter === sourceAdapter && r.externalId === externalId,
    );
    return hit ? existingEvidence(hit) : null;
  }

  async findByUrl(
    url: string,
    candidateId?: string,
    partyId?: string,
  ): Promise<ExistingEvidence | null> {
    const hit = this.rows.find(
      (r) =>
        r.url === url &&
        (r.candidateId ?? undefined) === candidateId &&
        (r.partyId ?? undefined) === partyId,
    );
    return hit ? existingEvidence(hit) : null;
  }

  async insert(row: NewEvidenceSource): Promise<void> {
    this.rows.push(row);
  }

  async update(id: string, patch: Partial<NewEvidenceSource>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
}

/** Drizzle/SQLite-backed store. */
export class DrizzleEvidenceStore implements EvidenceStore {
  constructor(private readonly db: typeof DbType) {}

  async findByHash(hash: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: evidenceSources.id })
      .from(evidenceSources)
      .where(eq(evidenceSources.contentHash, hash))
      .limit(1)
      .all();
    return rows[0]?.id ?? null;
  }

  async findByExternalId(
    sourceAdapter: string,
    externalId: string,
  ): Promise<ExistingEvidence | null> {
    const rows = await this.db
      .select({
        id: evidenceSources.id,
        contentHash: evidenceSources.contentHash,
        sourceType: evidenceSources.sourceType,
        title: evidenceSources.title,
        url: evidenceSources.url,
        author: evidenceSources.author,
        publishedAt: evidenceSources.publishedAt,
        documentType: evidenceSources.documentType,
        sourceStatus: evidenceSources.sourceStatus,
        parliamentNumber: evidenceSources.parliamentNumber,
      })
      .from(evidenceSources)
      .where(
        and(
          eq(evidenceSources.sourceAdapter, sourceAdapter),
          eq(evidenceSources.externalId, externalId),
        ),
      )
      .limit(1)
      .all();
    return rows[0] ?? null;
  }

  async findByUrl(
    url: string,
    candidateId?: string,
    partyId?: string,
  ): Promise<ExistingEvidence | null> {
    const conds = [eq(evidenceSources.url, url)];
    if (candidateId) conds.push(eq(evidenceSources.candidateId, candidateId));
    if (partyId) conds.push(eq(evidenceSources.partyId, partyId));
    const rows = await this.db
      .select({
        id: evidenceSources.id,
        contentHash: evidenceSources.contentHash,
        sourceType: evidenceSources.sourceType,
        title: evidenceSources.title,
        url: evidenceSources.url,
        author: evidenceSources.author,
        publishedAt: evidenceSources.publishedAt,
        documentType: evidenceSources.documentType,
        sourceStatus: evidenceSources.sourceStatus,
        parliamentNumber: evidenceSources.parliamentNumber,
      })
      .from(evidenceSources)
      .where(and(...conds))
      .limit(1)
      .all();
    return rows[0] ?? null;
  }

  async insert(row: NewEvidenceSource): Promise<void> {
    await this.db.insert(evidenceSources).values(row);
  }

  async update(id: string, patch: Partial<NewEvidenceSource>): Promise<void> {
    await this.db
      .update(evidenceSources)
      .set(patch)
      .where(eq(evidenceSources.id, id));
  }
}
