import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getAdapters } from "@/lib/server/ingestion/adapters";
import {
  extractTranscriptSection,
  type HansardSearchRequest,
  type HansardSearchResponse,
  NzHansardAdapter,
} from "@/lib/server/ingestion/adapters/hansard";
import { RateLimiter } from "@/lib/server/ingestion/rate-limit";
import type { AdapterContext, RawSource } from "@/lib/server/ingestion/types";
import searchSample from "./fixtures/hansard-search-sample.json";

const transcriptPath = path.join(
  process.cwd(),
  "tests/unit/fixtures/hansard-transcript-sample.html",
);

const context = (overrides: Partial<AdapterContext> = {}): AdapterContext => ({
  electionId: "nz-2026",
  rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
  robots: {
    allowed: async () => true,
  } as unknown as AdapterContext["robots"],
  ...overrides,
});

describe("NzHansardAdapter", () => {
  it("is registered as nz-hansard", () => {
    const [adapter] = getAdapters(["nz-hansard"]);

    expect(adapter.name).toBe("nz-hansard");
    expect(adapter.requiresIdentity).toBe(false);
  });

  it("discovers eligible Parliament 54 sections with pagination, since, and limit", async () => {
    const requests: HansardSearchRequest[] = [];
    const search = async (
      request: HansardSearchRequest,
    ): Promise<HansardSearchResponse> => {
      requests.push(request);
      return searchSample.pages[
        request.page - 1
      ] as unknown as HansardSearchResponse;
    };
    const adapter = new NzHansardAdapter({ search, pageSize: 3 });

    const refs = await adapter.discover(
      context({
        since: new Date("2024-01-01T00:00:00Z"),
        limit: 2,
      }),
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      types: ["DebateItem"],
      subtypes: ["Speech", "Question", "Vote"],
      parliament: 54,
      dateFrom: "2024-01-01",
      pageSize: 3,
      page: 1,
    });
    expect(refs).toHaveLength(2);
    expect(refs.map((ref) => ref.id)).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "44444444-4444-4444-4444-444444444444",
    ]);
    expect(refs.map((ref) => ref.sourceType)).toEqual([
      "hansard",
      "voting_record",
    ]);
    expect(refs[0].url).toBe(
      "https://hansard.parliament.nz/hansard-transcript/2024-01-02?sId=22222222-2222-2222-2222-222222222222&lang=en",
    );
  });

  it("defaults discovery to the opening of Parliament 54", async () => {
    const search = vi.fn(
      async (
        request: HansardSearchRequest,
      ): Promise<HansardSearchResponse> => ({
        page: request.page,
        pageSize: request.pageSize,
        "@odata.count": 0,
        value: [],
      }),
    );

    await new NzHansardAdapter({ search }).discover(context());

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2023-12-05" }),
    );
  });

  it("extracts one section by its stable Hansard id", async () => {
    const transcript = await readFile(transcriptPath, "utf-8");

    const section = extractTranscriptSection(
      transcript,
      "44444444-4444-4444-4444-444444444444",
    );

    expect(section).toContain("A party vote was called");
    expect(section).toContain("Ayes 70, Noes 50");
    expect(section).not.toContain("What progress has been made?");
    expect(
      extractTranscriptSection(
        transcript,
        "77777777-7777-7777-7777-777777777777",
      ),
    ).toBeNull();
    expect(
      extractTranscriptSection(
        '<a data-id="77777777777777777777777777777777"></a>',
        "77777777-7777-7777-7777-777777777777",
      ),
    ).toBeNull();
  });

  it("fetches and caches each sitting-day transcript", async () => {
    const transcriptHtml = await readFile(transcriptPath, "utf-8");
    const transcript = vi.fn(async () => transcriptHtml);
    const adapter = new NzHansardAdapter({ transcript });

    // Use two independently shaped refs from the same sitting date.
    const speech = {
      id: "22222222-2222-2222-2222-222222222222",
      url: "https://hansard.parliament.nz/hansard-transcript/2024-01-02?sId=22222222-2222-2222-2222-222222222222&lang=en",
      sourceType: "hansard" as const,
      title: "Housing Infrastructure Bill — First Reading",
      meta: {
        hansard: searchSample.pages[0].value[1],
      },
    };
    const question = {
      ...speech,
      id: "55555555-5555-5555-5555-555555555555",
      meta: {
        hansard: {
          ...searchSample.pages[1].value[1],
          sittingDate: "2024-01-02T00:00:00Z",
        },
      },
    };
    const wait = vi.fn(async () => undefined);
    const ctx = context({
      rateLimiter: { wait } as unknown as AdapterContext["rateLimiter"],
    });

    const first = await adapter.fetch(speech, ctx);
    const second = await adapter.fetch(question, ctx);

    expect(transcript).toHaveBeenCalledTimes(1);
    expect(transcript).toHaveBeenCalledWith("2024-01-02");
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(
      "https://hansard.parliament.nz/api/resources/transcript/2024-01-02",
    );
    expect(first?.raw).toContain("bill will build more homes");
    expect(second?.raw).toContain("What progress has been made?");
  });

  it("skips transcript fetch when robots disallows it", async () => {
    const transcript = vi.fn(async () => "<p>must not be fetched</p>");
    const adapter = new NzHansardAdapter({ transcript });
    const item = searchSample.pages[0].value[1];
    const robots = {
      allowed: vi.fn(async () => false),
    } as unknown as AdapterContext["robots"];

    const result = await adapter.fetch(
      {
        id: item.id,
        url: `https://hansard.parliament.nz/hansard-transcript/2024-01-02?sId=${item.id}&lang=en`,
        sourceType: "hansard",
        meta: { hansard: item },
      },
      context({ robots }),
    );

    expect(result).toBeNull();
    expect(robots.allowed).toHaveBeenCalledWith(
      "https://hansard.parliament.nz/api/resources/transcript/2024-01-02",
    );
    expect(transcript).not.toHaveBeenCalled();
  });

  it.each([
    {
      item: searchSample.pages[0].value[1],
      sourceType: "hansard" as const,
      documentType: "speech",
      author: "Hon EXAMPLE SPEAKER",
    },
    {
      item: searchSample.pages[1].value[0],
      sourceType: "voting_record" as const,
      documentType: "vote",
      author: "New Zealand Parliament",
    },
    {
      item: searchSample.pages[1].value[1],
      sourceType: "hansard" as const,
      documentType: "question",
      author: "ANOTHER QUESTIONER",
    },
  ])(
    "normalizes a $documentType as a durable corpus record",
    async ({ item, sourceType, documentType, author }) => {
      const adapter = new NzHansardAdapter();
      const raw: RawSource = {
        id: item.id,
        url: `https://hansard.parliament.nz/hansard-transcript/${item.sittingDate.slice(0, 10)}?sId=${item.id}&lang=en`,
        sourceType,
        title: [item.title, item.subtitle].filter(Boolean).join(" — "),
        raw: `<p>First paragraph &amp; detail.</p><script>noise()</script><p>Second paragraph.</p>`,
        meta: { hansard: item },
      };

      const normalized = await adapter.normalize(raw, context());

      expect(normalized).toMatchObject({
        electionId: "nz-2026",
        sourceType,
        title: raw.title,
        url: raw.url,
        author,
        externalId: item.id,
        documentType,
        sourceStatus: item.progress.toLowerCase(),
        parliamentNumber: 54,
        content: "First paragraph & detail.\nSecond paragraph.",
      });
      expect(normalized.publishedAt).toEqual(new Date(item.sittingDate));
      expect(normalized.candidateName).toBeUndefined();
    },
  );

  it("extracts actual Hansard participants without treating prose mentions as participants", async () => {
    const adapter = new NzHansardAdapter();
    const item = searchSample.pages[0].value[1];
    const raw: RawSource = {
      id: item.id,
      url: `https://hansard.parliament.nz/hansard-transcript/${item.sittingDate.slice(0, 10)}?sId=${item.id}&lang=en`,
      sourceType: "hansard",
      title: "Housing Infrastructure Bill — First Reading",
      raw: `<p><strong>Hon EXAMPLE SPEAKER:</strong> The bill mentions Jane Candidate but Jane is not speaking.</p>`,
      meta: { hansard: item },
    };

    const normalized = await adapter.normalize(raw, context());

    expect(normalized.people).toEqual([
      {
        officialId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "Hon EXAMPLE SPEAKER",
        role: "speaker",
        source: "official-metadata",
      },
    ]);
  });

  it("extracts distinct oral-question roles from speaker labels", async () => {
    const adapter = new NzHansardAdapter();
    const item = searchSample.pages[1].value[1];
    const raw: RawSource = {
      id: item.id,
      url: `https://hansard.parliament.nz/hansard-transcript/${item.sittingDate.slice(0, 10)}?sId=${item.id}&lang=en`,
      sourceType: "hansard",
      title: "Question No. 2—Transport",
      raw: `
        <p><strong>ANOTHER QUESTIONER:</strong> What progress has been made?</p>
        <p><strong>Hon MINISTER OF TRANSPORT:</strong> Considerable progress.</p>
        <p><strong>SPEAKER:</strong> Order.</p>
      `,
      meta: { hansard: item },
    };

    const normalized = await adapter.normalize(raw, context());

    expect(normalized.people).toEqual([
      {
        officialId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        name: "ANOTHER QUESTIONER",
        role: "questioner",
        source: "official-metadata",
      },
      {
        name: "Hon MINISTER OF TRANSPORT",
        role: "answerer",
        source: "transcript-label",
      },
      { name: "SPEAKER", role: "chair", source: "transcript-label" },
    ]);
  });

  it("extracts party vote stances conservatively from vote text", async () => {
    const adapter = new NzHansardAdapter();
    const item = searchSample.pages[1].value[0];
    const raw: RawSource = {
      id: item.id,
      url: `https://hansard.parliament.nz/hansard-transcript/${item.sittingDate.slice(0, 10)}?sId=${item.id}&lang=en`,
      sourceType: "voting_record",
      title: "Housing Infrastructure Bill — Second Reading—Vote",
      raw: `
        <p>A party vote was called for on the question.</p>
        <p>Ayes 63: Labour 34; Green Party 15; National 14.</p>
        <p>Noes 57: ACT 11; New Zealand First 8; Te Pāti Māori 6.</p>
      `,
      meta: { hansard: item },
    };

    const normalized = await adapter.normalize(raw, context());

    expect(normalized.parties).toEqual([
      {
        name: "Labour",
        stance: "aye",
        voteCount: 34,
        source: "transcript-vote-text",
      },
      {
        name: "Green Party",
        stance: "aye",
        voteCount: 15,
        source: "transcript-vote-text",
      },
      {
        name: "National",
        stance: "aye",
        voteCount: 14,
        source: "transcript-vote-text",
      },
      {
        name: "ACT",
        stance: "no",
        voteCount: 11,
        source: "transcript-vote-text",
      },
      {
        name: "New Zealand First",
        stance: "no",
        voteCount: 8,
        source: "transcript-vote-text",
      },
      {
        name: "Te Pāti Māori",
        stance: "no",
        voteCount: 6,
        source: "transcript-vote-text",
      },
    ]);
  });
});
