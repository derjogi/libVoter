// Wikipedia candidate-profile adapter.
//
// Pulls candidate articles via the official MediaWiki API (clean plain-text
// extracts, stable URLs, robots-friendly) and stores them as `statement`
// evidence linked by candidate and district.
//
// Wikipedia text is CC BY-SA; we keep `url` so the UI attributes + links out.

import { normalizeWhitespace } from "../text";
import type {
  AdapterContext,
  NormalizedSource,
  RawSource,
  SourceAdapter,
  SourceRef,
} from "../types";

export interface WikipediaCandidateSource {
  candidateName: string;
  district: string;
  wikiUrl: string;
}

const API_BASE = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "lib-voter-ingest/1.0 (GovHack demo; respectful)";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;

/** Fetch the plain-text extract of a Wikipedia article via the MediaWiki API. */
async function fetchWikiExtract(title: string): Promise<string> {
  const params = new URLSearchParams({
    format: "json",
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    redirects: "1",
    titles: title,
  });
  const url = `${API_BASE}?${params.toString()}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : RETRY_BASE_MS * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) throw new Error(`MediaWiki API ${res.status} for "${title}"`);
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { title?: string; extract?: string }> };
    };
    const pages = json.query?.pages ?? {};
    const page = Object.values(pages)[0];
    return page?.extract ?? "";
  }
  throw new Error(
    `MediaWiki API rate-limited after ${MAX_RETRIES} retries for "${title}"`,
  );
}

function articleTitle(wikiUrl: string): string {
  const pathname = new URL(wikiUrl).pathname;
  const wikiPath = pathname.split("/wiki/")[1] ?? "";
  return decodeURIComponent(wikiPath).replace(/_/g, " ");
}

export class WikipediaCandidateAdapter implements SourceAdapter {
  readonly name = "wikipedia-candidate";
  readonly elections = ["nz-2026"] as const;

  constructor(
    private readonly sources: WikipediaCandidateSource[],
    /** Injectable for tests. */
    private readonly fetchExtract: (
      title: string,
    ) => Promise<string> = fetchWikiExtract,
  ) {}

  async discover(_ctx: AdapterContext): Promise<SourceRef[]> {
    return this.sources.map((s) => {
      const wikiTitle = articleTitle(s.wikiUrl);
      return {
        url: s.wikiUrl,
        candidateName: s.candidateName,
        district: s.district,
        sourceType: "statement" as const,
        title: `${s.candidateName} — Wikipedia profile`,
        meta: { wikiTitle },
      };
    });
  }

  async fetch(ref: SourceRef, ctx: AdapterContext): Promise<RawSource | null> {
    const title = ref.meta?.wikiTitle as string | undefined;
    if (!title) return null;
    if (ref.url && !(await ctx.robots.allowed(ref.url))) {
      return null; // respect robots.txt
    }
    await ctx.rateLimiter.wait(ref.url ?? API_BASE);
    const raw = await this.fetchExtract(title);
    if (!raw.trim()) return null;
    return { ...ref, raw, author: "Wikipedia contributors" };
  }

  async normalize(
    raw: RawSource,
    ctx: AdapterContext,
  ): Promise<NormalizedSource> {
    return {
      electionId: ctx.electionId,
      candidateName: raw.candidateName,
      district: raw.district,
      sourceType: "statement",
      title: raw.title,
      url: raw.url,
      author: raw.author,
      content: normalizeWhitespace(raw.raw),
    };
  }
}
