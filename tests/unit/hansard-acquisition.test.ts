import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireHansardCorpus } from "@/lib/server/ingestion/hansard/acquire";
import type { HansardBrowser } from "@/lib/server/ingestion/hansard/agent-browser";
import { readManifest } from "@/lib/server/ingestion/hansard/cache";
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

  it("resumes a complete cache without opening the browser", async () => {
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
    expect(browser.start).not.toHaveBeenCalled();
    expect(browser.search).not.toHaveBeenCalled();
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
    browser.transcript.mockRejectedValueOnce(new Error("temporary failure"));

    const result = await acquireHansardCorpus({
      cacheDir,
      browser,
      since: "2024-01-01",
      pageSize: 3,
      minIntervalMs: 0,
    });

    expect(result.complete).toBe(false);
    expect(result.failures[0]).toMatchObject({
      kind: "transcript",
      message: "temporary failure",
    });
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
