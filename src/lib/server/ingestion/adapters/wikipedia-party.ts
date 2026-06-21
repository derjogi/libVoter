// NZ party-platform adapter (spec 010).
//
// The first real NZ 2026 source adapter. Real, current 2026 candidate lists
// aren't published yet, so the linkable nz-2026 data we *do* have is the six
// seeded parties. This adapter pulls each party's article via the official
// MediaWiki API (clean plain-text extracts, stable URLs, robots-friendly) and
// stores it as `party_policy` evidence linked by party. Candidate-level
// sources (Electoral Commission, Hansard) are the natural next adapters once
// real candidate lists exist.
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

interface PartySource {
  /** Must match the electionParties.name for nz-2026 (used for linking). */
  partyName: string;
  /** Wikipedia article title. */
  wikiTitle: string;
}

// partyName values match the seeded nz-2026 election_parties rows.
const NZ_PARTY_SOURCES: PartySource[] = [
  { partyName: "Labour", wikiTitle: "New Zealand Labour Party" },
  { partyName: "National", wikiTitle: "New Zealand National Party" },
  { partyName: "Green", wikiTitle: "Green Party of Aotearoa New Zealand" },
  { partyName: "ACT", wikiTitle: "ACT New Zealand" },
  { partyName: "NZ First", wikiTitle: "New Zealand First" },
  { partyName: "Te Pāti Māori", wikiTitle: "Māori Party" },
];

const API_BASE = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "lib-voter-ingest/1.0 (GovHack demo; respectful)";

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
  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`MediaWiki API ${res.status} for "${title}"`);
  const json = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string }> };
  };
  const pages = json.query?.pages ?? {};
  const page = Object.values(pages)[0];
  return page?.extract ?? "";
}

function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export class WikipediaPartyAdapter implements SourceAdapter {
  readonly name = "nz-party-policy";
  readonly elections = ["nz-2026"] as const;

  constructor(
    private readonly sources: PartySource[] = NZ_PARTY_SOURCES,
    /** Injectable for tests. */
    private readonly fetchExtract: (
      title: string,
    ) => Promise<string> = fetchWikiExtract,
  ) {}

  async discover(_ctx: AdapterContext): Promise<SourceRef[]> {
    return this.sources.map((s) => ({
      url: articleUrl(s.wikiTitle),
      partyName: s.partyName,
      sourceType: "party_policy" as const,
      title: `${s.partyName} — party platform (Wikipedia)`,
      meta: { wikiTitle: s.wikiTitle },
    }));
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
      partyName: raw.partyName,
      sourceType: "party_policy",
      title: raw.title,
      url: raw.url,
      author: raw.author,
      content: normalizeWhitespace(raw.raw),
    };
  }
}
