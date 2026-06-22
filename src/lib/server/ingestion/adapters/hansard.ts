// Official New Zealand Parliament Hansard corpus adapter (spec 012).
//
// The search API yields transcript section identifiers. A later fetch step
// extracts only that section from the sitting day's transcript, avoiding both
// Daily/Debate duplicates and premature candidate attribution.

import {
  createHansardCacheTransport,
  type HansardCacheTransport,
} from "../hansard/cache";
import { htmlToText } from "../text";
import type {
  AdapterContext,
  NormalizedSource,
  RawSource,
  SourceAdapter,
  SourceRef,
} from "../types";

const BASE_URL = "https://hansard.parliament.nz";
const SEARCH_URL = `${BASE_URL}/api/data/search`;
const PARLIAMENT_NUMBER = 54;
const TERM_START = new Date("2023-12-05T00:00:00.000Z");
const SUBTYPES = ["Speech", "Question", "Vote"] as const;

type HansardSubtype = (typeof SUBTYPES)[number];

export interface HansardSearchRequest {
  searchTab: number;
  keyword: null;
  types: ["DebateItem"];
  subtypes: HansardSubtype[];
  parliament: number;
  dateFrom: string;
  dateTo: null;
  portfolios: string[];
  datePeriod: null;
  restrictedFrom: null;
  restrictedTo: null;
  members: string[];
  orderByFields: ["SittingDate"];
  pageSize: number;
  page: number;
  direction: number;
}

export interface HansardSearchItem {
  id: string;
  title: string;
  subtitle?: string | null;
  sittingDate: string;
  documentType: string;
  documentSubtype: string;
  progress?: string | null;
  memberId?: string | null;
  memberName?: string | null;
  parliamentNumber: number;
  parentId?: string | null;
}

export interface HansardSearchResponse {
  pageSize: number;
  page: number;
  "@odata.count": number;
  value: HansardSearchItem[];
}

export interface HansardAdapterOptions {
  search?: (request: HansardSearchRequest) => Promise<HansardSearchResponse>;
  transcript?: (date: string) => Promise<string>;
  pageSize?: number;
  cacheDir?: string;
  allowPartialCache?: boolean;
}

type SearchHansard = NonNullable<HansardAdapterOptions["search"]>;
type FetchTranscript = NonNullable<HansardAdapterOptions["transcript"]>;

/** Official NZ Parliament Hansard corpus adapter (spec 012). */
export class NzHansardAdapter implements SourceAdapter {
  readonly name = "nz-hansard";
  readonly elections = ["nz-2026"] as const;
  readonly requiresIdentity = false;

  private readonly search: SearchHansard;
  private readonly transcript: FetchTranscript;
  private readonly pageSize: number;
  private readonly localCache: boolean;
  private readonly cache?: HansardCacheTransport;
  private readonly transcriptCache = new Map<string, Promise<string>>();

  constructor(options: HansardAdapterOptions = {}) {
    const cache = options.cacheDir
      ? createHansardCacheTransport(
          options.cacheDir,
          options.allowPartialCache ?? false,
        )
      : undefined;
    this.cache = cache;
    this.search = options.search ?? cache?.search ?? searchHansard;
    this.transcript =
      options.transcript ?? cache?.transcript ?? fetchTranscript;
    this.pageSize = options.pageSize ?? 100;
    this.localCache = cache !== undefined;
  }

  async discover(ctx: AdapterContext): Promise<SourceRef[]> {
    if (!this.localCache && !(await ctx.robots.allowed(SEARCH_URL))) return [];

    let from = laterDate(ctx.since, TERM_START);
    let pageSize = this.pageSize;
    const cacheMetadata = await this.cache?.metadata();
    if (cacheMetadata) {
      const cacheStart = new Date(`${cacheMetadata.since}T00:00:00.000Z`);
      if (from < cacheStart) {
        const requestedSince = ctx.since
          ? toDateOnly(ctx.since)
          : toDateOnly(TERM_START);
        ctx.log?.(
          `[nz-hansard] WARNING: requested --since ${requestedSince}, but cached Hansard is only available from ${cacheMetadata.since}; ingesting available coverage`,
        );
        from = cacheStart;
      }
      pageSize = cacheMetadata.pageSize;
    }
    const refs: SourceRef[] = [];
    let page = 1;

    while (ctx.limit === undefined || refs.length < ctx.limit) {
      if (cacheMetadata && !cacheMetadata.completedPages.includes(page)) break;
      const request = buildHansardSearchRequest(from, page, pageSize);
      if (!this.localCache) await ctx.rateLimiter.wait(SEARCH_URL);
      const response = await this.search(request);

      for (const item of response.value) {
        if (!isEligible(item, from)) continue;
        refs.push(toSourceRef(item));
        if (ctx.limit !== undefined && refs.length >= ctx.limit) break;
      }

      const exhausted =
        response.value.length === 0 ||
        response.page * pageSize >= response["@odata.count"];
      if (exhausted) break;
      page += 1;
    }

    return refs;
  }

  async fetch(ref: SourceRef, ctx: AdapterContext): Promise<RawSource | null> {
    const item = ref.meta?.hansard as HansardSearchItem | undefined;
    if (!ref.id || !item?.sittingDate) return null;

    const date = item.sittingDate.slice(0, 10);
    const transcriptUrl = `${BASE_URL}/api/resources/transcript/${date}`;
    if (!this.localCache && !(await ctx.robots.allowed(transcriptUrl))) {
      return null;
    }

    let pending = this.transcriptCache.get(date);
    if (!pending) {
      if (!this.localCache) await ctx.rateLimiter.wait(transcriptUrl);
      pending = this.transcript(date);
      this.transcriptCache.set(date, pending);
    }

    let transcript: string;
    try {
      transcript = await pending;
    } catch (error) {
      this.transcriptCache.delete(date);
      throw error;
    }

    const raw = extractTranscriptSection(transcript, ref.id);
    return raw ? { ...ref, raw } : null;
  }

  async normalize(
    raw: RawSource,
    ctx: AdapterContext,
  ): Promise<NormalizedSource> {
    const item = raw.meta?.hansard as HansardSearchItem | undefined;
    if (!item) {
      throw new Error("Hansard source is missing its search metadata");
    }

    return {
      electionId: ctx.electionId,
      sourceType: raw.sourceType,
      title: raw.title,
      url: raw.url,
      author: item.memberName || "New Zealand Parliament",
      publishedAt: new Date(item.sittingDate),
      externalId: item.id,
      documentType: item.documentSubtype.toLowerCase(),
      sourceStatus: item.progress?.toLowerCase(),
      parliamentNumber: item.parliamentNumber,
      content: htmlToText(raw.raw),
    };
  }
}

/** Extract one stable section from the sitting day's transcript HTML. */
export function extractTranscriptSection(
  transcript: string,
  sectionId: string,
): string | null {
  const expected = normalizeSectionId(sectionId);
  const anchor = /<a\b[^>]*\bdata-id\s*=\s*["']([0-9a-f-]{32,36})["'][^>]*>/gi;
  const matches = [...transcript.matchAll(anchor)];
  const index = matches.findIndex(
    (match) => normalizeSectionId(match[1]) === expected,
  );
  if (index === -1) return null;

  const start = (matches[index].index ?? 0) + matches[index][0].length;
  const end = matches[index + 1]?.index ?? transcript.length;
  const section = transcript
    .slice(start, end)
    .replace(/^\s*<\/a\s*>/i, "")
    .trim();
  return section || null;
}

function normalizeSectionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function laterDate(requested: Date | undefined, minimum: Date): Date {
  return requested && requested > minimum ? requested : minimum;
}

export function buildHansardSearchRequest(
  from: Date,
  page: number,
  pageSize: number,
): HansardSearchRequest {
  return {
    searchTab: 1,
    keyword: null,
    types: ["DebateItem"],
    subtypes: [...SUBTYPES],
    parliament: PARLIAMENT_NUMBER,
    dateFrom: toDateOnly(from),
    dateTo: null,
    portfolios: [],
    datePeriod: null,
    restrictedFrom: null,
    restrictedTo: null,
    members: [],
    orderByFields: ["SittingDate"],
    pageSize,
    page,
    direction: 1,
  };
}

/** Format dates for the Hansard API's System.DateOnly contract. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isEligible(item: HansardSearchItem, from: Date): boolean {
  return (
    item.documentType === "DebateItem" &&
    SUBTYPES.includes(item.documentSubtype as HansardSubtype) &&
    item.parliamentNumber === PARLIAMENT_NUMBER &&
    new Date(item.sittingDate) >= from
  );
}

function toSourceRef(item: HansardSearchItem): SourceRef {
  const date = item.sittingDate.slice(0, 10);
  return {
    id: item.id,
    url: `${BASE_URL}/hansard-transcript/${date}?sId=${item.id}&lang=en`,
    sourceType: item.documentSubtype === "Vote" ? "voting_record" : "hansard",
    title: [item.title, item.subtitle].filter(Boolean).join(" — "),
    meta: { hansard: item },
  };
}

async function searchHansard(
  request: HansardSearchRequest,
): Promise<HansardSearchResponse> {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return readJsonResponse<HansardSearchResponse>(response, "Hansard search");
}

async function fetchTranscript(date: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/resources/transcript/${date}`);
  return readJsonResponse<string>(response, "Hansard transcript");
}

async function readJsonResponse<T>(
  response: Response,
  label: string,
): Promise<T> {
  if (!response.ok)
    throw new Error(`${label} request failed (${response.status})`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `${label} returned ${contentType || "non-JSON content"}; the Parliament site may require browser verification`,
    );
  }
  return response.json() as Promise<T>;
}
