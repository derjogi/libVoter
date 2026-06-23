// Ingestion runner (spec 010).
//
// Orchestrates: discover → fetch → normalize → resolve identity → dedup →
// upsert into evidence_sources. Idempotent by contentHash; same-URL content
// changes update in place; unresolved records are collected into an
// `unmatched` report instead of being dropped.

import { randomUUID } from "node:crypto";
import type { NewEvidenceSource } from "../../db/schema";
import { contentHash } from "./hash";
import type { IdentityResolver } from "./identity";
import { RateLimiter } from "./rate-limit";
import { RobotsGuard } from "./robots";
import type { EvidenceStore, ExistingEvidence } from "./store";
import type {
  AdapterContext,
  NormalizedSource,
  SourceAdapter,
  SourceRef,
} from "./types";

export interface UnmatchedRecord {
  adapter: string;
  candidateName?: string;
  partyName?: string;
  district?: string;
  url?: string;
  sourceType: string;
}

export interface RunResult {
  inserted: number;
  updated: number;
  /** Unchanged sources skipped via contentHash dedup. */
  skipped: number;
  /** Records whose identity could not be resolved (reported, not stored). */
  unmatched: UnmatchedRecord[];
  /** Adapters that threw during discover/fetch/normalize. */
  errors: Array<{ adapter: string; ref?: string; message: string }>;
}

export interface RunOptions {
  electionId: string;
  store: EvidenceStore;
  resolver: IdentityResolver;
  limit?: number;
  since?: Date;
  dryRun?: boolean;
  rateLimiter?: RateLimiter;
  robots?: RobotsGuard;
  /** Conservative default gap between requests, ms. */
  minIntervalMs?: number;
  userAgent?: string;
  log?: (msg: string) => void;
}

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_UA = "lib-voter-ingest/1.0 (+https://github.com/; respectful)";

export async function runIngestion(
  adapters: SourceAdapter[],
  opts: RunOptions,
): Promise<RunResult> {
  const log = opts.log ?? (() => {});
  const result: RunResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    unmatched: [],
    errors: [],
  };

  const ctx: AdapterContext = {
    electionId: opts.electionId,
    limit: opts.limit,
    since: opts.since,
    log,
    rateLimiter:
      opts.rateLimiter ??
      new RateLimiter({
        minIntervalMs: opts.minIntervalMs ?? DEFAULT_INTERVAL_MS,
      }),
    robots: opts.robots ?? new RobotsGuard(opts.userAgent ?? DEFAULT_UA),
  };

  for (const adapter of adapters) {
    log(`[${adapter.name}] discovering…`);
    let refs: SourceRef[];
    try {
      refs = await adapter.discover(ctx);
    } catch (err) {
      result.errors.push({
        adapter: adapter.name,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (opts.limit !== undefined) refs = refs.slice(0, opts.limit);
    log(`[${adapter.name}] ${refs.length} source(s)`);

    for (const ref of refs) {
      try {
        const raw = await adapter.fetch(ref, ctx);
        if (!raw) {
          result.skipped++;
          continue;
        }
        const out = await adapter.normalize(raw, ctx);
        const normalized = Array.isArray(out) ? out : [out];
        for (const n of normalized) {
          await ingestOne(adapter, n, opts, result);
        }
      } catch (err) {
        result.errors.push({
          adapter: adapter.name,
          ref: ref.url ?? ref.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}

async function ingestOne(
  adapter: SourceAdapter,
  n: NormalizedSource,
  opts: RunOptions,
  result: RunResult,
): Promise<void> {
  const content = n.content?.trim();
  if (!content) {
    result.skipped++;
    return;
  }

  const { candidateId, partyId, matched } = opts.resolver.resolve({
    candidateName: n.candidateName,
    partyName: n.partyName,
    district: n.district,
  });

  if (!matched && adapter.requiresIdentity !== false) {
    result.unmatched.push({
      adapter: adapter.name,
      candidateName: n.candidateName,
      partyName: n.partyName,
      district: n.district,
      url: n.url,
      sourceType: n.sourceType,
    });
    return;
  }

  const hash = contentHash(content);
  const now = new Date();
  const base: NewEvidenceSource = {
    id: randomUUID(),
    electionId: n.electionId ?? opts.electionId,
    candidateId,
    partyId,
    sourceAdapter: adapter.name,
    externalId: n.externalId ?? null,
    documentType: n.documentType ?? null,
    sourceStatus: n.sourceStatus ?? null,
    parliamentNumber: n.parliamentNumber ?? null,
    sourceType: n.sourceType,
    title: n.title ?? null,
    url: n.url ?? null,
    author: n.author ?? null,
    publishedAt: n.publishedAt ?? null,
    content,
    contentHash: hash,
    fetchedAt: now,
    createdAt: now,
  };

  const updatePatch: Partial<NewEvidenceSource> = {
    sourceType: base.sourceType,
    title: base.title,
    url: base.url,
    author: base.author,
    publishedAt: base.publishedAt,
    documentType: base.documentType,
    sourceStatus: base.sourceStatus,
    parliamentNumber: base.parliamentNumber,
    content,
    contentHash: hash,
    fetchedAt: now,
  };

  // Stable source identity takes precedence over URL/content. Publication
  // revisions may change both while still representing the same document.
  if (n.externalId) {
    const existing = await opts.store.findByExternalId(
      adapter.name,
      n.externalId,
    );
    if (existing) {
      if (
        existing.contentHash === hash &&
        hasSameDocumentMetadata(existing, base)
      ) {
        if (!opts.dryRun)
          await replaceDocumentRelationships(existing.id, n, opts);
        result.skipped++;
        return;
      }
      if (!opts.dryRun) await opts.store.update(existing.id, updatePatch);
      if (!opts.dryRun)
        await replaceDocumentRelationships(existing.id, n, opts);
      result.updated++;
      return;
    }
  }

  // Legacy sources without a known external id remain globally idempotent by
  // content hash.
  if (!n.externalId && (await opts.store.findByHash(hash))) {
    result.skipped++;
    return;
  }

  // Same source URL + identity but different content → update in place.
  if (n.url) {
    const existing = await opts.store.findByUrl(n.url, candidateId, partyId);
    if (existing) {
      if (!opts.dryRun) await opts.store.update(existing.id, updatePatch);
      if (!opts.dryRun)
        await replaceDocumentRelationships(existing.id, n, opts);
      result.updated++;
      return;
    }
  }

  if (!opts.dryRun) await opts.store.insert(base);
  if (!opts.dryRun) await replaceDocumentRelationships(base.id, n, opts);
  result.inserted++;
}

async function replaceDocumentRelationships(
  evidenceSourceId: string,
  n: NormalizedSource,
  opts: RunOptions,
): Promise<void> {
  if (!opts.store.replaceDocumentRelationships) return;
  if (!n.people?.length && !n.parties?.length) return;
  await opts.store.replaceDocumentRelationships(evidenceSourceId, {
    electionId: n.electionId ?? opts.electionId,
    people: n.people,
    parties: n.parties,
  });
}

function hasSameDocumentMetadata(
  existing: ExistingEvidence,
  next: NewEvidenceSource,
): boolean {
  const existingPublishedAt = existing.publishedAt?.getTime() ?? null;
  const nextPublishedAt = next.publishedAt?.getTime() ?? null;
  return (
    existing.sourceType === next.sourceType &&
    existing.title === (next.title ?? null) &&
    existing.url === (next.url ?? null) &&
    existing.author === (next.author ?? null) &&
    existingPublishedAt === nextPublishedAt &&
    existing.documentType === (next.documentType ?? null) &&
    existing.sourceStatus === (next.sourceStatus ?? null) &&
    existing.parliamentNumber === (next.parliamentNumber ?? null)
  );
}
