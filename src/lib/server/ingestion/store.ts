// Evidence persistence port (spec 010).
//
// The runner writes through this small interface so it can be unit-tested with
// an in-memory fake (no SQLite) while production uses the Drizzle-backed
// implementation. Dedup/change-detection lives in the runner; the store just
// provides the lookups it needs plus insert/update.

import { and, eq } from "drizzle-orm";
import {
  electionParties,
  evidenceSources,
  hansardDocumentParties,
  hansardDocumentPeople,
  hansardMentions,
  hansardUtterances,
  type NewEvidenceSource,
  people,
} from "../../db/schema";
import type { db as DbType } from "../db";
import { normalizeName } from "./identity";
import type {
  NormalizedMentionRelationship,
  NormalizedPartyRelationship,
  NormalizedPersonRelationship,
  NormalizedUtterance,
} from "./types";

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
  replaceDocumentRelationships?(
    evidenceSourceId: string,
    relationships: EvidenceDocumentRelationships,
  ): Promise<void>;
}

export interface EvidenceDocumentRelationships {
  electionId: string;
  people?: NormalizedPersonRelationship[];
  parties?: NormalizedPartyRelationship[];
  utterances?: NormalizedUtterance[];
  mentions?: NormalizedMentionRelationship[];
}

export interface StoredDocumentPersonRelationship {
  evidenceSourceId: string;
  personId: string;
  officialId?: string;
  personName: string;
  role: string;
  source: string;
}

export interface StoredDocumentPartyRelationship {
  evidenceSourceId: string;
  partyId?: string;
  partyName: string;
  stance: string;
  voteCount?: number;
  source: string;
}

export interface StoredHansardUtterance {
  evidenceSourceId: string;
  sequence: number;
  speakerName?: string;
  speakerRole?: string;
  text: string;
}

export interface StoredHansardMention {
  evidenceSourceId: string;
  personId: string;
  officialId?: string;
  personName: string;
  role: "mentioned";
  source: string;
  utteranceSequence?: number;
  confidence: number;
}

/** In-memory store, used by tests and `--dry-run`. */
export class InMemoryEvidenceStore implements EvidenceStore {
  rows: NewEvidenceSource[] = [];
  people: Array<{ id: string; name: string }> = [];
  candidacies: unknown[] = [];
  documentPeople: StoredDocumentPersonRelationship[] = [];
  documentParties: StoredDocumentPartyRelationship[] = [];
  utterances: StoredHansardUtterance[] = [];
  mentions: StoredHansardMention[] = [];

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

  async replaceDocumentRelationships(
    evidenceSourceId: string,
    relationships: EvidenceDocumentRelationships,
  ): Promise<void> {
    this.documentPeople = this.documentPeople.filter(
      (r) => r.evidenceSourceId !== evidenceSourceId,
    );
    this.documentParties = this.documentParties.filter(
      (r) => r.evidenceSourceId !== evidenceSourceId,
    );
    this.utterances = this.utterances.filter(
      (r) => r.evidenceSourceId !== evidenceSourceId,
    );
    this.mentions = this.mentions.filter(
      (r) => r.evidenceSourceId !== evidenceSourceId,
    );

    for (const utterance of relationships.utterances ?? []) {
      this.utterances.push({
        evidenceSourceId,
        sequence: utterance.sequence,
        speakerName: utterance.speakerName,
        speakerRole: utterance.speakerRole,
        text: utterance.text,
      });
    }

    for (const mention of relationships.mentions ?? []) {
      const personId = hansardMentionPersonId(mention);
      if (!this.people.some((p) => p.id === personId)) {
        this.people.push({ id: personId, name: mention.name });
      }
      this.mentions.push({
        evidenceSourceId,
        personId,
        officialId: mention.officialId,
        personName: mention.name,
        role: mention.role,
        source: mention.source,
        utteranceSequence: mention.utteranceSequence,
        confidence: mention.confidence,
      });
    }

    for (const person of relationships.people ?? []) {
      const personId = hansardPersonId(person);
      if (!this.people.some((p) => p.id === personId)) {
        this.people.push({ id: personId, name: person.name });
      }
      this.documentPeople.push({
        evidenceSourceId,
        personId,
        officialId: person.officialId,
        personName: person.name,
        role: person.role,
        source: person.source,
      });
    }

    for (const party of relationships.parties ?? []) {
      this.documentParties.push({
        evidenceSourceId,
        partyId: undefined,
        partyName: party.name,
        stance: party.stance,
        voteCount: party.voteCount,
        source: party.source,
      });
    }
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

  async replaceDocumentRelationships(
    evidenceSourceId: string,
    relationships: EvidenceDocumentRelationships,
  ): Promise<void> {
    await this.db
      .delete(hansardDocumentPeople)
      .where(eq(hansardDocumentPeople.evidenceSourceId, evidenceSourceId));
    await this.db
      .delete(hansardDocumentParties)
      .where(eq(hansardDocumentParties.evidenceSourceId, evidenceSourceId));
    await this.db
      .delete(hansardMentions)
      .where(eq(hansardMentions.evidenceSourceId, evidenceSourceId));
    await this.db
      .delete(hansardUtterances)
      .where(eq(hansardUtterances.evidenceSourceId, evidenceSourceId));

    const now = new Date();
    for (const utterance of relationships.utterances ?? []) {
      await this.db.insert(hansardUtterances).values({
        id: relationshipId(
          evidenceSourceId,
          "utterance",
          String(utterance.sequence),
          utterance.speakerName ?? "unknown",
        ),
        evidenceSourceId,
        sequence: utterance.sequence,
        speakerName: utterance.speakerName ?? null,
        speakerRole: utterance.speakerRole ?? null,
        text: utterance.text,
        createdAt: now,
      });
    }

    for (const mention of relationships.mentions ?? []) {
      const personId = hansardMentionPersonId(mention);
      await this.db
        .insert(people)
        .values({ id: personId, name: mention.name, createdAt: now })
        .onConflictDoNothing();
      await this.db.insert(hansardMentions).values({
        id: relationshipId(
          evidenceSourceId,
          "mention",
          personId,
          String(mention.utteranceSequence ?? 0),
        ),
        evidenceSourceId,
        personId,
        officialId: mention.officialId ?? null,
        personName: mention.name,
        role: mention.role,
        source: mention.source,
        utteranceSequence: mention.utteranceSequence ?? null,
        confidence: mention.confidence,
        createdAt: now,
      });
    }

    for (const person of relationships.people ?? []) {
      const personId = hansardPersonId(person);
      await this.db
        .insert(people)
        .values({ id: personId, name: person.name, createdAt: now })
        .onConflictDoNothing();
      await this.db.insert(hansardDocumentPeople).values({
        id: relationshipId(evidenceSourceId, "person", personId, person.role),
        evidenceSourceId,
        personId,
        officialId: person.officialId ?? null,
        personName: person.name,
        role: person.role,
        source: person.source,
        createdAt: now,
      });
    }

    const partyIndex = await this.partyIndex(relationships.electionId);
    for (const party of relationships.parties ?? []) {
      const partyId = partyIndex.get(normalizeName(party.name));
      await this.db.insert(hansardDocumentParties).values({
        id: relationshipId(
          evidenceSourceId,
          "party",
          partyId ?? party.name,
          party.stance,
        ),
        evidenceSourceId,
        partyId: partyId ?? null,
        partyName: party.name,
        stance: party.stance,
        voteCount: party.voteCount ?? null,
        source: party.source,
        createdAt: now,
      });
    }
  }

  private async partyIndex(electionId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: electionParties.id, name: electionParties.name })
      .from(electionParties)
      .where(eq(electionParties.electionId, electionId))
      .all();
    return new Map(rows.map((row) => [normalizeName(row.name), row.id]));
  }
}

function hansardPersonId(person: NormalizedPersonRelationship): string {
  const raw = person.officialId ?? normalizeName(person.name);
  return `hansard-person-${slugId(raw)}`;
}

function hansardMentionPersonId(person: NormalizedMentionRelationship): string {
  const raw = person.officialId ?? normalizeName(person.name);
  return `hansard-person-${slugId(raw)}`;
}

function relationshipId(
  evidenceSourceId: string,
  kind: "person" | "party" | "utterance" | "mention",
  entityId: string,
  roleOrStance: string,
): string {
  return `${evidenceSourceId}:${kind}:${slugId(entityId)}:${slugId(roleOrStance)}`;
}

function slugId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
