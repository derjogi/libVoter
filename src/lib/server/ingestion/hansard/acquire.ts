import { access } from "node:fs/promises";
import {
  buildHansardSearchRequest,
  type HansardSearchItem,
  type HansardSearchResponse,
} from "../adapters/hansard";
import type { HansardBrowser } from "./agent-browser";
import {
  cachePaths,
  createManifest,
  type HansardCacheManifest,
  readManifest,
  readSearchPage,
  readTranscript,
  writeManifest,
  writeSearchPage,
  writeTranscript,
} from "./cache";

const SUPPORTED_SUBTYPES = new Set(["Speech", "Question", "Vote"]);

export interface AcquireHansardOptions {
  cacheDir: string;
  browser: HansardBrowser;
  since?: string;
  pageSize?: number;
  limitPages?: number;
  limitDates?: number;
  refresh?: boolean;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (message: string) => void;
}

export async function acquireHansardCorpus(
  options: AcquireHansardOptions,
): Promise<HansardCacheManifest> {
  const since = options.since ?? "2023-12-05";
  const pageSize = options.pageSize ?? 100;
  const sleep = options.sleep ?? defaultSleep;
  const interval = options.minIntervalMs ?? 1_000;
  const manifest = await loadManifest(options.cacheDir, since, pageSize);
  if (manifest.complete && !options.refresh) return manifest;

  let browserWasOpened = false;
  try {
    browserWasOpened = true;
    await options.browser.start();
    const pages = await acquirePages(
      options,
      manifest,
      since,
      pageSize,
      sleep,
      interval,
    );
    await acquireTranscripts(options, manifest, pages, since, sleep, interval);
    updateCompleteness(manifest, pages, options);
    await checkpoint(options.cacheDir, manifest);
    return manifest;
  } finally {
    if (browserWasOpened) await options.browser.close();
  }
}

async function acquirePages(
  options: AcquireHansardOptions,
  manifest: HansardCacheManifest,
  since: string,
  pageSize: number,
  sleep: (ms: number) => Promise<void>,
  interval: number,
): Promise<HansardSearchResponse[]> {
  const pages: HansardSearchResponse[] = [];
  let page = 1;
  let expectedPages = manifest.totalDocuments
    ? Math.ceil(manifest.totalDocuments / pageSize)
    : Number.POSITIVE_INFINITY;

  while (page <= expectedPages) {
    if (
      options.limitPages !== undefined &&
      pages.length >= options.limitPages
    ) {
      break;
    }
    try {
      let response: HansardSearchResponse;
      if (!options.refresh && manifest.completedPages.includes(page)) {
        response = await readSearchPage(options.cacheDir, page);
      } else {
        await pace(sleep, interval);
        response = await options.browser.search(
          buildHansardSearchRequest(
            new Date(`${since}T00:00:00.000Z`),
            page,
            pageSize,
          ),
        );
        await writeSearchPage(options.cacheDir, page, response);
        addUnique(manifest.completedPages, page);
        clearFailure(manifest, "search", String(page));
      }
      pages.push(response);
      manifest.totalDocuments = response["@odata.count"];
      expectedPages = Math.ceil(response["@odata.count"] / response.pageSize);
      await checkpoint(options.cacheDir, manifest);
      options.onProgress?.(`Hansard search page ${page}/${expectedPages}`);
      page += 1;
    } catch (error) {
      recordFailure(manifest, "search", String(page), error);
      await checkpoint(options.cacheDir, manifest);
      break;
    }
  }
  return pages;
}

async function acquireTranscripts(
  options: AcquireHansardOptions,
  manifest: HansardCacheManifest,
  pages: HansardSearchResponse[],
  since: string,
  sleep: (ms: number) => Promise<void>,
  interval: number,
): Promise<void> {
  const dates = eligibleDates(pages, since);
  let processed = 0;
  for (const date of dates) {
    if (options.limitDates !== undefined && processed >= options.limitDates)
      break;
    processed += 1;
    try {
      if (!options.refresh && manifest.completedDates.includes(date)) {
        await readTranscript(options.cacheDir, date);
        continue;
      }
      await pace(sleep, interval);
      await writeTranscript(
        options.cacheDir,
        date,
        await options.browser.transcript(date),
      );
      addUnique(manifest.completedDates, date);
      clearFailure(manifest, "transcript", date);
      await checkpoint(options.cacheDir, manifest);
      options.onProgress?.(`Hansard transcript ${date}`);
    } catch (error) {
      recordFailure(manifest, "transcript", date, error);
      await checkpoint(options.cacheDir, manifest);
    }
  }
}

function eligibleDates(
  pages: HansardSearchResponse[],
  since: string,
): string[] {
  const dates = new Set<string>();
  for (const item of pages.flatMap((page) => page.value)) {
    if (isEligible(item, since)) dates.add(item.sittingDate.slice(0, 10));
  }
  return [...dates].sort();
}

function isEligible(item: HansardSearchItem, since: string): boolean {
  return (
    item.documentType === "DebateItem" &&
    SUPPORTED_SUBTYPES.has(item.documentSubtype) &&
    item.parliamentNumber === 54 &&
    item.sittingDate.slice(0, 10) >= since
  );
}

async function loadManifest(
  cacheDir: string,
  since: string,
  pageSize: number,
): Promise<HansardCacheManifest> {
  try {
    await access(cachePaths(cacheDir).manifest);
    const manifest = await readManifest(cacheDir);
    if (manifest.since !== since || manifest.pageSize !== pageSize) {
      throw new Error(
        `Hansard cache contract mismatch: expected since=${since} pageSize=${pageSize}`,
      );
    }
    return manifest;
  } catch (error) {
    if (isMissingFile(error)) return createManifest({ since, pageSize });
    throw error;
  }
}

function updateCompleteness(
  manifest: HansardCacheManifest,
  pages: HansardSearchResponse[],
  options: AcquireHansardOptions,
): void {
  const expectedPages = manifest.totalDocuments
    ? Math.ceil(manifest.totalDocuments / manifest.pageSize)
    : 0;
  const dates = eligibleDates(pages, manifest.since);
  manifest.complete =
    options.limitPages === undefined &&
    options.limitDates === undefined &&
    expectedPages > 0 &&
    manifest.completedPages.length >= expectedPages &&
    dates.every((date) => manifest.completedDates.includes(date)) &&
    manifest.failures.length === 0;
}

async function checkpoint(
  cacheDir: string,
  manifest: HansardCacheManifest,
): Promise<void> {
  manifest.completedPages.sort((a, b) => a - b);
  manifest.completedDates.sort();
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(cacheDir, manifest);
}

function addUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function clearFailure(
  manifest: HansardCacheManifest,
  kind: "search" | "transcript",
  key: string,
): void {
  manifest.failures = manifest.failures.filter(
    (failure) => failure.kind !== kind || failure.key !== key,
  );
}

function recordFailure(
  manifest: HansardCacheManifest,
  kind: "search" | "transcript",
  key: string,
  error: unknown,
): void {
  clearFailure(manifest, kind, key);
  manifest.failures.push({
    kind,
    key,
    message: error instanceof Error ? error.message : String(error),
  });
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function pace(
  sleep: (ms: number) => Promise<void>,
  interval: number,
): Promise<void> {
  if (interval > 0) await sleep(interval);
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
