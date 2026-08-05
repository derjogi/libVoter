import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireHansardCorpus } from "@/lib/server/ingestion/hansard/acquire";
import type { HansardBrowser } from "@/lib/server/ingestion/hansard/agent-browser";
import {
  createManifest,
  readManifest,
  writeManifest,
} from "@/lib/server/ingestion/hansard/cache";
import searchSample from "./fixtures/hansard-search-sample.json";

const tempDirs: string[] = [];

async function tempCache(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hansard-acquire-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

function fakeBrowser() {
  return {
    start: vi.fn(async () => undefined),
    search: vi.fn(async (request) => searchSample.pages[request.page - 1]),
    transcript: vi.fn(async (date) => `<p>Transcript for ${date}</p>`),
    close: vi.fn(async () => undefined),
  } as unknown as HansardBrowser & {
    start: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    transcript: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe("acquireHansardCorpus", () => {
  it("fetches every page and each eligible sitting date once", async () => {
    const cacheDir = await tempCache();
    const browser = fakeBrowser();

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    expect(browser.search).toHaveBeenCalledTimes(2);
    expect(browser.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dateFrom: "2024-01-01", page: 1 }),
    );
    expect(browser.transcript.mock.calls.map(([date]) => date).sort()).toEqual([
      "2024-01-02",
      "2024-02-01",
      "2024-03-01",
    ]);
    expect(browser.close).toHaveBeenCalledOnce();
    expect(result.complete).toBe(true);
    expect(result.completedPages).toEqual([1, 2]);
    expect(result.completedDates).toHaveLength(3);
  });

  it("uses the requested page capacity when the final page reports its shorter length", async () => {
    const cacheDir = await tempCache();
    const manifest = createManifest({ since: "2024-01-01", pageSize: 3 });
    manifest.failures.push({
      kind: "search",
      key: "3",
      message: "final empty page failed validation",
    });
    await writeManifest(cacheDir, manifest);
    const browser = fakeBrowser();
    const firstPage = {
      ...searchSample.pages[0],
      "@odata.count": 5,
    };
    const finalPage = {
      ...searchSample.pages[1],
      "@odata.count": 5,
      pageSize: 2,
      value: searchSample.pages[1].value.slice(0, 2),
    };
    browser.search.mockImplementation(async (request) => {
      if (request.page === 1) return firstPage;
      if (request.page === 2) return finalPage;
      throw new Error(`unexpected search page ${request.page}`);
    });

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    expect(browser.search).toHaveBeenCalledTimes(2);
    expect(result.completedPages).toEqual([1, 2]);
    expect(result.failures).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("re-runs a complete cache: re-checks page 1, skips cached transcripts", async () => {
    const cacheDir = await tempCache();
    await acquireHansardCorpus({
      cacheDir,
      browser: fakeBrowser(),
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });
    const browser = fakeBrowser();

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    expect(result.complete).toBe(true);
    // Page 1 is always re-fetched from the API to detect new content.
    expect(browser.start).toHaveBeenCalledOnce();
    expect(browser.search).toHaveBeenCalledTimes(1);
    expect(browser.transcript).not.toHaveBeenCalled();
  });

  it("marks limited smoke caches as partial and resumable", async () => {
    const cacheDir = await tempCache();
    const browser = fakeBrowser();

    await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      limitPages: 1,
      limitDates: 1,
      minIntervalMs: 0,
    });
    const manifest = await readManifest(cacheDir);

    expect(manifest.complete).toBe(false);
    expect(manifest.completedPages).toEqual([1]);
    expect(manifest.completedDates).toEqual(["2024-01-02"]);
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("records transcript failures and still closes the browser", async () => {
    const cacheDir = await tempCache();
    const browser = fakeBrowser();
    browser.transcript.mockRejectedValue(new Error("persistent failure"));

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.complete).toBe(false);
    expect(result.failures[0]).toMatchObject({
      kind: "transcript",
      message: "failed after 2 attempts: persistent failure",
    });
    expect(browser.transcript).toHaveBeenCalledTimes(6);
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("retries transient browser failures before recording an error", async () => {
    const cacheDir = await tempCache();
    const browser = fakeBrowser();
    browser.search.mockRejectedValueOnce(new Error("browser daemon restarted"));

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.failures).toEqual([]);
    expect(result.complete).toBe(true);
    expect(browser.search).toHaveBeenCalledTimes(3);
  });

  it("handles --since change: resets search pages, keeps cached transcripts", async () => {
    const cacheDir = await tempCache();
    await acquireHansardCorpus({
      cacheDir,
      browser: fakeBrowser(),
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });
    const firstManifest = await readManifest(cacheDir);
    expect(firstManifest.completedDates).toHaveLength(3);

    // Re-run with a different --since.
    const browser = fakeBrowser();
    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-02-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    // Search pages are re-fetched (date-filtered results changed).
    expect(browser.search).toHaveBeenCalled();
    // Transcripts that are still in range are skipped (already downloaded).
    expect(browser.transcript).not.toHaveBeenCalled();
    // The manifest keeps the old completedDates.
    expect(result.completedDates).toEqual(firstManifest.completedDates);
    expect(result.since).toBe("2024-02-01");
  });

  it("detects new content when total document count grows", async () => {
    const cacheDir = await tempCache();
    // First fetch: 6 documents, 2 pages.
    await acquireHansardCorpus({
      cacheDir,
      browser: fakeBrowser(),
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    // Second fetch: the corpus grew (count 6 → 9, 3 pages).
    const browser = fakeBrowser();
    const grownPage1 = {
      ...searchSample.pages[0],
      "@odata.count": 9,
    };
    const grownPage2 = {
      ...searchSample.pages[1],
      "@odata.count": 9,
    };
    const grownPage3 = {
      pageSize: 3,
      page: 3,
      "@odata.count": 9,
      value: [
        {
          id: "77777777-7777-7777-7777-777777777777",
          title: "New Speech After Last Fetch",
          subtitle: "",
          sittingDate: "2024-06-01T00:00:00Z",
          documentType: "DebateItem",
          documentSubtype: "Speech",
          progress: "Final",
          memberId: null,
          memberName: null,
          parliamentNumber: 54,
          parentId: null,
        },
      ],
    };
    browser.search.mockImplementation(async (request) => {
      if (request.page === 1) return grownPage1;
      if (request.page === 2) return grownPage2;
      if (request.page === 3) return grownPage3;
      throw new Error(`unexpected page ${request.page}`);
    });

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    // Page 1 is always fetched; count changed so page 2 is re-fetched too.
    expect(browser.search).toHaveBeenCalledTimes(3);
    // The new transcript date is fetched; old ones are skipped.
    expect(browser.transcript).toHaveBeenCalledTimes(1);
    expect(browser.transcript).toHaveBeenCalledWith("2024-06-01");
    expect(result.completedPages).toEqual([1, 2, 3]);
    expect(result.complete).toBe(true);
  });
});
