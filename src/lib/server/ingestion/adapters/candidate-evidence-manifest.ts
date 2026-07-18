import { readFile } from "node:fs/promises";
import { z } from "zod";
import { SOURCE_TYPES } from "@/lib/db/schema";
import type {
  AdapterContext,
  NormalizedSource,
  RawSource,
  SourceAdapter,
  SourceRef,
} from "../types";

const coverageStatusSchema = z.enum([
  "covered_by_manifest",
  "covered_by_hansard",
  "no_reliable_personal_source",
]);

const coverageSchema = z.object({
  candidateName: z.string().trim().min(1),
  candidacyId: z.string().trim().min(1),
  status: coverageStatusSchema,
  note: z.string().trim().min(1).optional(),
});

const sourceSchema = z.object({
  externalId: z.string().trim().min(1),
  candidateName: z.string().trim().min(1),
  candidacyId: z.string().trim().min(1),
  district: z.string().trim().min(1),
  sourceType: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(1),
  url: z.string().url(),
  author: z.string().trim().min(1),
  publishedAt: z.string().datetime().optional(),
  documentType: z.string().trim().min(1).optional(),
  sourceStatus: z.string().trim().min(1).optional(),
  parliamentNumber: z.number().int().positive().optional(),
  content: z.string().trim().min(1),
});

const manifestSchema = z
  .object({
    version: z.literal(1),
    electionId: z.string().trim().min(1),
    slice: z.string().trim().min(1),
    coverage: z.array(coverageSchema).min(1),
    sources: z.array(sourceSchema),
  })
  .superRefine((manifest, context) => {
    const coverageByCandidacy = new Map(
      manifest.coverage.map((candidate) => [candidate.candidacyId, candidate]),
    );
    if (coverageByCandidacy.size !== manifest.coverage.length) {
      context.addIssue({
        code: "custom",
        message: "coverage candidacy ids must be unique",
        path: ["coverage"],
      });
    }
    const externalIds = new Set<string>();
    manifest.sources.forEach((source, index) => {
      if (externalIds.has(source.externalId)) {
        context.addIssue({
          code: "custom",
          message: "source external ids must be unique",
          path: ["sources", index, "externalId"],
        });
      }
      externalIds.add(source.externalId);
      const coverage = coverageByCandidacy.get(source.candidacyId);
      if (
        !coverage ||
        coverage.candidateName !== source.candidateName ||
        coverage.status !== "covered_by_manifest"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "source candidate must have covered status and matching identity",
          path: ["sources", index, "candidacyId"],
        });
      }
    });
    for (const [index, candidate] of manifest.coverage.entries()) {
      if (
        candidate.status === "covered_by_manifest" &&
        !manifest.sources.some(
          (source) => source.candidacyId === candidate.candidacyId,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "manifest-covered candidate must have at least one source",
          path: ["coverage", index, "status"],
        });
      }
      if (
        candidate.status === "no_reliable_personal_source" &&
        !candidate.note
      ) {
        context.addIssue({
          code: "custom",
          message: "uncovered candidate must explain the source gap",
          path: ["coverage", index, "note"],
        });
      }
    }
  });

export type CandidateEvidenceManifest = z.infer<typeof manifestSchema>;
export type CandidateEvidenceManifestSource =
  CandidateEvidenceManifest["sources"][number];

export async function loadCandidateEvidenceManifest(
  path: string,
): Promise<CandidateEvidenceManifest> {
  return manifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/**
 * Offline, reviewable ingestion adapter for exact candidate-attributed excerpts.
 * The manifest keeps the cited URL and the text snapshot together so ingestion
 * is deterministic even if a campaign site later changes or disappears.
 */
export class CandidateEvidenceManifestAdapter implements SourceAdapter {
  readonly name = "nz-candidate-manifest";
  readonly elections: readonly string[];

  constructor(private readonly manifest: CandidateEvidenceManifest) {
    this.elections = [manifest.electionId];
  }

  async discover(ctx: AdapterContext): Promise<SourceRef[]> {
    if (ctx.electionId !== this.manifest.electionId) return [];
    return this.manifest.sources
      .filter(
        (source) =>
          !ctx.since ||
          !source.publishedAt ||
          new Date(source.publishedAt) >= ctx.since,
      )
      .map((source) => ({
        id: source.externalId,
        url: source.url,
        candidateName: source.candidateName,
        district: source.district,
        sourceType: source.sourceType,
        title: source.title,
        meta: { source },
      }));
  }

  async fetch(ref: SourceRef): Promise<RawSource | null> {
    const source = manifestSource(ref);
    return {
      ...ref,
      raw: source.content,
      author: source.author,
      publishedAt: source.publishedAt
        ? new Date(source.publishedAt)
        : undefined,
    };
  }

  async normalize(raw: RawSource): Promise<NormalizedSource> {
    const source = manifestSource(raw);
    return {
      electionId: this.manifest.electionId,
      candidateName: source.candidateName,
      district: source.district,
      sourceType: source.sourceType,
      title: source.title,
      url: source.url,
      author: source.author,
      publishedAt: source.publishedAt
        ? new Date(source.publishedAt)
        : undefined,
      externalId: source.externalId,
      documentType: source.documentType,
      sourceStatus: source.sourceStatus,
      parliamentNumber: source.parliamentNumber,
      content: source.content,
    };
  }
}

function manifestSource(ref: SourceRef): CandidateEvidenceManifestSource {
  const source = ref.meta?.source;
  return sourceSchema.parse(source);
}
