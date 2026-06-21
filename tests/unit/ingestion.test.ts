// Unit tests for the spec 010 ingestion pipeline: text cleaning, robots +
// rate-limit guards, identity resolution, and runner dedup/idempotency.

import { describe, expect, it } from "vitest";
import { AucklandCandidateAdapter } from "@/lib/server/ingestion/adapters/auckland";
import { contentHash } from "@/lib/server/ingestion/hash";
import {
  IdentityResolver,
  normalizeName,
} from "@/lib/server/ingestion/identity";
import { RateLimiter } from "@/lib/server/ingestion/rate-limit";
import { isAllowed, parseRobotsTxt } from "@/lib/server/ingestion/robots";
import { runIngestion } from "@/lib/server/ingestion/runner";
import { InMemoryEvidenceStore } from "@/lib/server/ingestion/store";
import { htmlToText } from "@/lib/server/ingestion/text";
import type {
  AdapterContext,
  NormalizedSource,
  RawSource,
  SourceAdapter,
  SourceRef,
} from "@/lib/server/ingestion/types";

// ---- A tiny in-memory adapter so runner tests need no network/files. ----
class FakeAdapter implements SourceAdapter {
  readonly name = "fake";
  constructor(private readonly items: NormalizedSource[]) {}
  async discover(): Promise<SourceRef[]> {
    return this.items.map((n, i) => ({
      url: n.url,
      id: String(i),
      candidateName: n.candidateName,
      partyName: n.partyName,
      district: n.district,
      sourceType: n.sourceType,
      meta: { n },
    }));
  }
  async fetch(ref: SourceRef): Promise<RawSource | null> {
    const n = ref.meta?.n as NormalizedSource;
    return { ...ref, raw: n.content };
  }
  async normalize(raw: RawSource): Promise<NormalizedSource> {
    return raw.meta?.n as NormalizedSource;
  }
}

const resolverFor = (
  candidates: { id: string; name: string; district?: string }[] = [],
  parties: { id: string; name: string }[] = [],
) => new IdentityResolver({ candidates, parties });

const baseRunOpts = (
  store: InMemoryEvidenceStore,
  resolver: IdentityResolver,
) => ({
  electionId: "auckland-2025",
  store,
  resolver,
});

describe("htmlToText", () => {
  it("strips tags, scripts, decodes entities and collapses whitespace", () => {
    const html = `
      <html><head><style>p{color:red}</style><script>evil()</script></head>
      <body>
        <h2>Housing</h2>
        <p>Build   more&nbsp;homes &amp; protect&#160;tenants.</p>
        <p>Line&#x2014;two<br>same para</p>
      </body></html>`;
    expect(htmlToText(html)).toBe(
      "Housing\nBuild more homes & protect tenants.\nLine—two\nsame para",
    );
  });
});

describe("robots.txt guard", () => {
  const robots = parseRobotsTxt(`
    User-agent: *
    Disallow: /private/
    Allow: /private/public/

    User-agent: badbot
    Disallow: /
  `);

  it("allows un-disallowed paths and applies longest-match Allow override", () => {
    expect(isAllowed(robots, "/candidates/")).toBe(true);
    expect(isAllowed(robots, "/private/secret")).toBe(false);
    expect(isAllowed(robots, "/private/public/page")).toBe(true);
  });

  it("applies a user-agent-specific full block", () => {
    expect(isAllowed(robots, "/anything", "badbot")).toBe(false);
    expect(isAllowed(robots, "/anything", "goodbot")).toBe(true);
  });
});

describe("RateLimiter", () => {
  it("spaces successive requests to the same host by the min interval", async () => {
    let clock = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      minIntervalMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms; // simulate time passing during the sleep
      },
    });

    await limiter.wait("https://example.com/a"); // first: no wait
    await limiter.wait("https://example.com/b"); // same host: must wait full interval
    await limiter.wait("https://other.com/a"); // different host: no wait

    expect(slept).toEqual([1000]);
  });
});

describe("identity resolution", () => {
  it("matches 'LAST, First' against 'First Last' formats", () => {
    expect(normalizeName("KAHUI, Marcia Irene")).toBe("MARCIA IRENE KAHUI");
    const r = resolverFor([
      { id: "7", name: "Marcia Irene Kahui", district: "Tamaki" },
    ]).resolve({ candidateName: "KAHUI, Marcia Irene", district: "Tamaki" });
    expect(r).toEqual({ candidateId: "7", partyId: undefined, matched: true });
  });

  it("disambiguates same-named candidates by district", () => {
    const resolver = resolverFor([
      { id: "1", name: "John Smith", district: "Albany Ward" },
      { id: "2", name: "John Smith", district: "Manukau Ward" },
    ]);
    expect(
      resolver.resolve({ candidateName: "John Smith", district: "Manukau" })
        .candidateId,
    ).toBe("2");
  });

  it("reports unmatched when no candidate/party is found", () => {
    const r = resolverFor([]).resolve({ candidateName: "Nobody Here" });
    expect(r.matched).toBe(false);
    expect(r.candidateId).toBeUndefined();
  });
});

describe("runIngestion", () => {
  const statement = (
    name: string,
    content: string,
    url = `https://x/${name}`,
  ): NormalizedSource => ({
    candidateName: name,
    district: "Central",
    sourceType: "statement",
    url,
    content,
  });

  it("inserts matched rows and reports unmatched ones (not stored)", async () => {
    const store = new InMemoryEvidenceStore();
    const resolver = resolverFor([
      { id: "1", name: "Alice Ako", district: "Central" },
    ]);
    const adapter = new FakeAdapter([
      statement("Alice Ako", "Housing first."),
      statement("Ghost Person", "Unmatched content."),
    ]);

    const result = await runIngestion([adapter], baseRunOpts(store, resolver));

    expect(result.inserted).toBe(1);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].candidateName).toBe("Ghost Person");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].candidateId).toBe("1");
    expect(store.rows[0].url).toBe("https://x/Alice Ako");
    expect(store.rows[0].sourceType).toBe("statement");
  });

  it("is idempotent: re-running unchanged sources adds no duplicates", async () => {
    const store = new InMemoryEvidenceStore();
    const resolver = resolverFor([
      { id: "1", name: "Alice Ako", district: "Central" },
    ]);
    const adapter = new FakeAdapter([statement("Alice Ako", "Housing first.")]);

    const first = await runIngestion([adapter], baseRunOpts(store, resolver));
    const second = await runIngestion([adapter], baseRunOpts(store, resolver));

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it("updates in place when the same URL's content changes", async () => {
    const store = new InMemoryEvidenceStore();
    const resolver = resolverFor([
      { id: "1", name: "Alice Ako", district: "Central" },
    ]);
    const url = "https://x/alice";

    await runIngestion([new FakeAdapter([statement("Alice Ako", "v1", url)])], {
      ...baseRunOpts(store, resolver),
    });
    const result = await runIngestion(
      [new FakeAdapter([statement("Alice Ako", "v2 updated", url)])],
      { ...baseRunOpts(store, resolver) },
    );

    expect(result.updated).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].content).toBe("v2 updated");
    expect(store.rows[0].contentHash).toBe(contentHash("v2 updated"));
  });

  it("dry-run resolves + dedups but writes nothing", async () => {
    const store = new InMemoryEvidenceStore();
    const resolver = resolverFor([
      { id: "1", name: "Alice Ako", district: "Central" },
    ]);
    const adapter = new FakeAdapter([statement("Alice Ako", "Housing first.")]);

    const result = await runIngestion([adapter], {
      ...baseRunOpts(store, resolver),
      dryRun: true,
    });

    expect(result.inserted).toBe(1);
    expect(store.rows).toHaveLength(0);
  });
});

describe("WikipediaPartyAdapter (party-policy, linked by party)", () => {
  const ctx = {
    electionId: "nz-2026",
    rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
    robots: { allowed: async () => true },
  } as unknown as AdapterContext;

  it("normalizes a party article into party_policy evidence and links by party", async () => {
    const { WikipediaPartyAdapter } = await import(
      "@/lib/server/ingestion/adapters/wikipedia-party"
    );
    const adapter = new WikipediaPartyAdapter(
      [{ partyName: "ACT", wikiTitle: "ACT New Zealand" }],
      async () =>
        "ACT is a   classical-liberal party.\n\nIt supports lower taxes.",
    );

    const refs = await adapter.discover(ctx);
    expect(refs).toHaveLength(1);
    expect(refs[0].sourceType).toBe("party_policy");
    expect(refs[0].url).toBe("https://en.wikipedia.org/wiki/ACT_New_Zealand");

    const raw = await adapter.fetch(refs[0], ctx);
    const normalized = await adapter.normalize(raw!, ctx);
    expect(normalized.partyName).toBe("ACT");
    expect(normalized.content).toBe(
      "ACT is a classical-liberal party.\nIt supports lower taxes.",
    );

    // Links to the seeded nz-2026 party id via the resolver.
    const resolver = resolverFor(
      [],
      [{ id: "nz-2026-party-act", name: "ACT" }],
    );
    const r = resolver.resolve({ partyName: normalized.partyName });
    expect(r).toEqual({
      candidateId: undefined,
      partyId: "nz-2026-party-act",
      matched: true,
    });
  });

  it("skips a source when robots.txt disallows it", async () => {
    const { WikipediaPartyAdapter } = await import(
      "@/lib/server/ingestion/adapters/wikipedia-party"
    );
    const adapter = new WikipediaPartyAdapter(
      [{ partyName: "ACT", wikiTitle: "ACT New Zealand" }],
      async () => "should not be fetched",
    );
    const blocked = {
      ...ctx,
      robots: { allowed: async () => false },
    } as unknown as AdapterContext;
    const refs = await adapter.discover(blocked);
    expect(await adapter.fetch(refs[0], blocked)).toBeNull();
  });
});

describe("AucklandCandidateAdapter (golden HTML→text)", () => {
  it("normalizes a candidate JSON record into clean evidence content", async () => {
    // Write a tiny fixture and point the adapter at it.
    const adapter = new AucklandCandidateAdapter(
      `${import.meta.dirname}/fixtures/auckland-sample.json`,
    );
    const ctx = { electionId: "auckland-2025" } as AdapterContext;

    const refs = await adapter.discover(ctx);
    expect(refs).toHaveLength(1);
    expect(refs[0].candidateName).toBe("SMITH, Jane");

    const raw = await adapter.fetch(refs[0], ctx);
    expect(raw).not.toBeNull();
    const normalized = await adapter.normalize(raw!, ctx);

    expect(normalized.sourceType).toBe("statement");
    expect(normalized.url).toBe("https://voteauckland.co.nz/jane");
    expect(normalized.content).toContain("Build more homes & support tenants.");
    expect(normalized.content).toContain("Housing: Pro density near transit.");
    // HTML in the source must be stripped.
    expect(normalized.content).not.toContain("<");
  });
});
