import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { z } from "zod";
import type {
  HansardSearchRequest,
  HansardSearchResponse,
} from "../adapters/hansard";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const failureSchema = z.object({
  kind: z.enum(["search", "transcript"]),
  key: z.string(),
  message: z.string(),
});

export const hansardCacheManifestSchema = z.object({
  version: z.literal(1),
  parliamentNumber: z.literal(54),
  since: z.string().regex(DATE_ONLY),
  pageSize: z.number().int().positive(),
  totalDocuments: z.number().int().nonnegative().optional(),
  completedPages: z.array(z.number().int().positive()),
  completedDates: z.array(z.string().regex(DATE_ONLY)),
  failures: z.array(failureSchema),
  complete: z.boolean(),
  updatedAt: z.string().datetime(),
});

const searchItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    sittingDate: z.string(),
    documentType: z.string(),
    documentSubtype: z.string(),
    progress: z.string().nullable().optional(),
    memberId: z.string().nullable().optional(),
    memberName: z.string().nullable().optional(),
    parliamentNumber: z.number().int(),
    parentId: z.string().nullable().optional(),
  })
  .passthrough();

export const hansardSearchResponseSchema = z
  .object({
    pageSize: z.number().int().positive(),
    page: z.number().int().positive(),
    "@odata.count": z.number().int().nonnegative(),
    value: z.array(searchItemSchema),
  })
  .passthrough();

export type HansardCacheManifest = z.infer<typeof hansardCacheManifestSchema>;

export interface CreateManifestOptions {
  since: string;
  pageSize: number;
}

export interface HansardCacheTransport {
  search(request: HansardSearchRequest): Promise<HansardSearchResponse>;
  transcript(date: string): Promise<string>;
}

export function createHansardCacheTransport(
  cacheDir: string,
  allowPartial = false,
): HansardCacheTransport {
  let manifestPromise: Promise<HansardCacheManifest> | undefined;
  const manifest = async () => {
    manifestPromise ??= readManifest(cacheDir);
    const value = await manifestPromise;
    if (!value.complete && !allowPartial) {
      throw new Error(
        `Hansard cache at ${cacheDir} is incomplete; finish acquisition or explicitly allow a partial sample`,
      );
    }
    return value;
  };
  return {
    async search(request) {
      const metadata = await manifest();
      if (
        request.parliament !== metadata.parliamentNumber ||
        request.pageSize !== metadata.pageSize ||
        request.dateFrom !== metadata.since
      ) {
        throw new Error(`Hansard cache contract mismatch at ${cacheDir}`);
      }
      return readSearchPage(cacheDir, request.page);
    },
    async transcript(date) {
      await manifest();
      return readTranscript(cacheDir, date);
    },
  };
}

export function createManifest(
  options: CreateManifestOptions,
): HansardCacheManifest {
  return hansardCacheManifestSchema.parse({
    version: 1,
    parliamentNumber: 54,
    since: options.since,
    pageSize: options.pageSize,
    completedPages: [],
    completedDates: [],
    failures: [],
    complete: false,
    updatedAt: new Date().toISOString(),
  });
}

export function cachePaths(cacheDir: string) {
  return {
    manifest: path.join(cacheDir, "manifest.json"),
    searchPage: (page: number) =>
      path.join(
        cacheDir,
        "search",
        `page-${String(page).padStart(6, "0")}.json`,
      ),
    transcript: (date: string) =>
      path.join(cacheDir, "transcripts", `${date}.html.gz`),
  };
}

export async function writeManifest(
  cacheDir: string,
  manifest: HansardCacheManifest,
): Promise<void> {
  const parsed = hansardCacheManifestSchema.parse({
    ...manifest,
    updatedAt: manifest.updatedAt,
  });
  await atomicWrite(cachePaths(cacheDir).manifest, formatJson(parsed));
}

export async function readManifest(
  cacheDir: string,
): Promise<HansardCacheManifest> {
  const file = cachePaths(cacheDir).manifest;
  return readValidatedJson(file, "manifest", hansardCacheManifestSchema);
}

export async function writeSearchPage(
  cacheDir: string,
  page: number,
  response: HansardSearchResponse,
): Promise<void> {
  const parsed = hansardSearchResponseSchema.parse(response);
  await atomicWrite(cachePaths(cacheDir).searchPage(page), formatJson(parsed));
}

export async function readSearchPage(
  cacheDir: string,
  page: number,
): Promise<HansardSearchResponse> {
  return readValidatedJson(
    cachePaths(cacheDir).searchPage(page),
    `page ${page}`,
    hansardSearchResponseSchema,
  ) as Promise<HansardSearchResponse>;
}

export async function writeTranscript(
  cacheDir: string,
  date: string,
  transcript: string,
): Promise<void> {
  assertDate(date);
  if (!transcript.trim())
    throw new Error(`Hansard transcript ${date} is empty`);
  await atomicWrite(
    cachePaths(cacheDir).transcript(date),
    await gzipAsync(Buffer.from(transcript)),
  );
}

export async function readTranscript(
  cacheDir: string,
  date: string,
): Promise<string> {
  assertDate(date);
  const file = cachePaths(cacheDir).transcript(date);
  try {
    return (await gunzipAsync(await readFile(file))).toString("utf-8");
  } catch (error) {
    throw cacheError(`transcript ${date}`, file, error);
  }
}

async function atomicWrite(
  file: string,
  content: string | Buffer,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content);
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

async function readValidatedJson<T>(
  file: string,
  identity: string,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    return schema.parse(JSON.parse(await readFile(file, "utf-8")));
  } catch (error) {
    throw cacheError(identity, file, error);
  }
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertDate(date: string): void {
  if (!DATE_ONLY.test(date)) throw new Error(`Invalid Hansard date: ${date}`);
}

function cacheError(identity: string, file: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Invalid Hansard cache ${identity} at ${file}: ${message}`);
}
