// Ingestion pipeline types (spec 010).
//
// The ETL shape is: discover() → fetch() → normalize() → runner dedup/upsert.
// Adapters are source-specific; the runner, identity resolution, dedup and
// the robots/rate-limit guards are shared. Keeping these as plain interfaces
// (no Playwright / DB imports) lets the pipeline be unit-tested without a
// network or a real database.

import type { SourceType } from "../../db/schema";
import type { RateLimiter } from "./rate-limit";
import type { RobotsGuard } from "./robots";

/** A source discovered by an adapter, before fetching its body. */
export interface SourceRef {
  /** Canonical URL of the source (used for change-detection + "link out"). */
  url?: string;
  /** Stable id for non-URL sources (e.g. a Hansard speech id). */
  id?: string;
  /** Who/what the source is about — drives identity resolution. */
  candidateName?: string;
  partyName?: string;
  /** Ward / electorate, used to disambiguate same-named candidates. */
  district?: string;
  sourceType: SourceType;
  title?: string;
  /** Adapter-specific payload carried through fetch()/normalize(). */
  meta?: Record<string, unknown>;
}

/** Raw payload returned by fetch(), before cleaning. */
export interface RawSource extends SourceRef {
  /** Raw body (HTML / text / extracted-PDF text). */
  raw: string;
  author?: string;
  publishedAt?: Date;
}

/**
 * A cleaned evidence row, not yet linked to a candidate/party id. Identity
 * resolution fills candidateId/partyId before upsert; unresolved rows are
 * reported, never silently dropped.
 */
export interface NormalizedSource {
  /** Optional; the runner defaults this from --election when unset. */
  electionId?: string;
  candidateName?: string;
  partyName?: string;
  district?: string;
  sourceType: SourceType;
  title?: string;
  url?: string;
  author?: string;
  publishedAt?: Date;
  /** Stable source-system identifier, independent of URL and content version. */
  externalId?: string;
  /** Source-native document classification, e.g. speech, question, or vote. */
  documentType?: string;
  /** Publication lifecycle status, e.g. draft, corrected, or final. */
  sourceStatus?: string;
  /** Parliament or legislative term number when the source supplies one. */
  parliamentNumber?: number;
  /** Cleaned full text — the durable record we re-chunk and embed. */
  content: string;
}

/** Shared services handed to every adapter call. */
export interface AdapterContext {
  electionId: string;
  limit?: number;
  /** Only ingest sources published on/after this date, when supported. */
  since?: Date;
  /** Emit adapter diagnostics through the runner's configured logger. */
  log?: (message: string) => void;
  rateLimiter: RateLimiter;
  robots: RobotsGuard;
}

/**
 * One implementation per source. Each isolates the source-specific HTML/PDF
 * parsing so it can be tested individually and promoted to its own child spec
 * if it grows large.
 */
export interface SourceAdapter {
  /** Stable name used by `--source` and the registry. */
  readonly name: string;
  /** Election ids this adapter serves (for validation / help text). */
  readonly elections?: readonly string[];
  /** Defaults to true; corpus adapters may persist documents without owners. */
  readonly requiresIdentity?: boolean;
  discover(ctx: AdapterContext): Promise<SourceRef[]>;
  fetch(ref: SourceRef, ctx: AdapterContext): Promise<RawSource | null>;
  normalize(
    raw: RawSource,
    ctx: AdapterContext,
  ): Promise<NormalizedSource | NormalizedSource[]>;
}
