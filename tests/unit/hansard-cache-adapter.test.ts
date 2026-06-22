import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NzHansardAdapter } from "@/lib/server/ingestion/adapters/hansard";
import {
  createManifest,
  writeManifest,
  writeSearchPage,
  writeTranscript,
} from "@/lib/server/ingestion/hansard/cache";
import type { AdapterContext } from "@/lib/server/ingestion/types";
import searchSample from "./fixtures/hansard-search-sample.json";

const tempDirs: string[] = [];

async function buildCache(complete: boolean): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hansard-adapter-cache-"));
  tempDirs.push(dir);
  const manifest = createManifest({ since: "2024-01-01", pageSize: 3 });
  manifest.completedPages = [1];
  manifest.completedDates = ["2024-01-02"];
  manifest.totalDocuments = 3;
  manifest.complete = complete;
  await writeSearchPage(dir, 1, {
    ...searchSample.pages[0],
    "@odata.count": 3,
  });
  await writeTranscript(
    dir,
    "2024-01-02",
    await readFile(
      path.join(
        process.cwd(),
        "tests/unit/fixtures/hansard-transcript-sample.html",
      ),
      "utf-8",
    ),
  );
  await writeManifest(dir, manifest);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

function context() {
  const allowed = vi.fn(async () => {
    throw new Error("cache mode must not consult robots");
  });
  const wait = vi.fn(async () => {
    throw new Error("cache mode must not rate-limit local reads");
  });
  return {
    ctx: {
      electionId: "nz-2026",
      since: new Date("2024-01-01T00:00:00Z"),
      limit: 1,
      robots: { allowed } as unknown as AdapterContext["robots"],
      rateLimiter: { wait } as unknown as AdapterContext["rateLimiter"],
    },
    allowed,
    wait,
  };
}

describe("cached NzHansardAdapter", () => {
  it("discovers and fetches entirely from a complete local cache", async () => {
    const cacheDir = await buildCache(true);
    const adapter = new NzHansardAdapter({ cacheDir, pageSize: 3 });
    const { ctx, allowed, wait } = context();

    const refs = await adapter.discover(ctx);
    const raw = await adapter.fetch(refs[0], ctx);
    const normalized = raw ? await adapter.normalize(raw, ctx) : null;

    expect(refs).toHaveLength(1);
    expect(raw?.raw).toContain("bill will build more homes");
    expect(normalized).toMatchObject({
      externalId: "22222222-2222-2222-2222-222222222222",
      documentType: "speech",
      content:
        "Hon EXAMPLE SPEAKER: The bill will build more homes & infrastructure.\nIt also supports public transport.",
    });
    expect(allowed).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("rejects incomplete caches unless sample mode is explicit", async () => {
    const cacheDir = await buildCache(false);
    const strict = new NzHansardAdapter({ cacheDir, pageSize: 3 });
    const partial = new NzHansardAdapter({
      cacheDir,
      pageSize: 3,
      allowPartialCache: true,
    });

    await expect(strict.discover(context().ctx)).rejects.toThrow("incomplete");
    await expect(partial.discover(context().ctx)).resolves.toHaveLength(1);
  });
});
