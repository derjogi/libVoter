import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cachePaths,
  createHansardCacheTransport,
  createManifest,
  readManifest,
  readSearchPage,
  readTranscript,
  writeManifest,
  writeSearchPage,
  writeTranscript,
} from "@/lib/server/ingestion/hansard/cache";
import searchSample from "./fixtures/hansard-search-sample.json";

const tempDirs: string[] = [];

async function tempCache(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hansard-cache-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

describe("Hansard cache storage", () => {
  it("round-trips a versioned manifest atomically", async () => {
    const dir = await tempCache();
    const manifest = createManifest({ since: "2023-12-05", pageSize: 100 });

    await writeManifest(dir, manifest);

    expect(await readManifest(dir)).toEqual(manifest);
    expect(manifest).toMatchObject({
      version: 1,
      parliamentNumber: 54,
      since: "2023-12-05",
      pageSize: 100,
      complete: false,
      completedPages: [],
      completedDates: [],
      failures: [],
    });
    expect(await readdir(dir)).toEqual(["manifest.json"]);
  });

  it("round-trips validated search pages and gzip transcripts", async () => {
    const dir = await tempCache();
    const page = searchSample.pages[0];
    const transcript = "<main><p>A Hansard contribution.</p></main>";

    await writeSearchPage(dir, 1, page);
    await writeTranscript(dir, "2024-01-02", transcript);

    expect(await readSearchPage(dir, 1)).toEqual(page);
    expect(await readTranscript(dir, "2024-01-02")).toBe(transcript);
    expect((await readdir(path.join(dir, "search"))).sort()).toEqual([
      "page-000001.json",
    ]);
    expect(await readdir(path.join(dir, "transcripts"))).toEqual([
      "2024-01-02.html.gz",
    ]);
  });

  it("uses manifest metadata as the stored cache layout", async () => {
    const dir = await tempCache();
    const manifest = createManifest({ since: "2024-01-01", pageSize: 3 });
    manifest.completedPages = [1];
    manifest.totalDocuments = 3;
    manifest.complete = true;
    await writeSearchPage(dir, 1, {
      ...searchSample.pages[0],
      "@odata.count": 3,
    });
    await writeManifest(dir, manifest);
    const transport = createHansardCacheTransport(dir);

    await expect(transport.metadata()).resolves.toMatchObject({
      since: "2024-01-01",
      pageSize: 3,
      totalDocuments: 3,
    });
    await expect(
      transport.search({
        searchTab: 1,
        keyword: null,
        types: ["DebateItem"],
        subtypes: ["Speech"],
        parliament: 54,
        dateFrom: "2024-02-01",
        dateTo: null,
        portfolios: [],
        datePeriod: null,
        restrictedFrom: null,
        restrictedTo: null,
        members: [],
        orderByFields: ["SittingDate"],
        pageSize: 100,
        page: 1,
        direction: 1,
      }),
    ).resolves.toMatchObject({ page: 1, pageSize: 3 });
  });

  it("reports missing and corrupt cache files with their identity", async () => {
    const dir = await tempCache();

    await expect(readSearchPage(dir, 8)).rejects.toThrow("page 8");
    await expect(readTranscript(dir, "2024-02-03")).rejects.toThrow(
      "2024-02-03",
    );

    const paths = cachePaths(dir);
    await writeFile(paths.manifest, "{}");
    await expect(readManifest(dir)).rejects.toThrow("manifest");

    await writeTranscript(dir, "2024-02-03", "valid");
    await writeFile(paths.transcript("2024-02-03"), "not gzip");
    await expect(readTranscript(dir, "2024-02-03")).rejects.toThrow(
      "2024-02-03",
    );
  });
});
