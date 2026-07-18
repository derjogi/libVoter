import { and, asc, eq, inArray, max } from "drizzle-orm";
import {
  candidacies,
  corpusRevisions,
  evidenceSources,
  hansardUtterances,
  people,
  races,
  type SourceType,
} from "@/lib/db/schema";
import {
  type CorpusPublicationDraft,
  type PassageDraft,
  publishCorpusRevision,
} from "@/lib/evidence/corpus-publication";
import type { db as activeDb } from "@/lib/server/db";
import { publishCorpusRevisionTransaction } from "@/lib/server/evidence/corpus-publication";
import type { CandidateEvidenceManifest } from "@/lib/server/ingestion/adapters/candidate-evidence-manifest";
import { contentHash } from "@/lib/server/ingestion/hash";

export type CandidateCoverageExpectation =
  | "covered_by_manifest"
  | "covered_by_hansard"
  | "no_reliable_personal_source";

export interface CandidateCorpusCandidate {
  candidacyId: string;
  personId: string;
  name: string;
  expectedCoverage: CandidateCoverageExpectation;
}

export interface CandidateCorpusSource {
  id: string;
  candidateId: string | null;
  sourceAdapter: string | null;
  externalId: string | null;
  sourceType: SourceType;
  content: string;
  contentHash: string | null;
}

export interface CandidateCorpusUtterance {
  evidenceSourceId: string;
  sequence: number;
  speakerName: string | null;
  text: string;
}

export interface CandidateCorpusInput {
  corpusKey: string;
  sequence: number;
  createdAt: Date;
  candidates: CandidateCorpusCandidate[];
  sources: CandidateCorpusSource[];
  utterances: CandidateCorpusUtterance[];
}

export interface CandidateCorpusCoverage {
  candidateName: string;
  expectedCoverage: CandidateCoverageExpectation;
  passages: number;
  sources: number;
}

export interface CandidateCorpusBuildResult {
  draft: CorpusPublicationDraft;
  coverage: CandidateCorpusCoverage[];
}

const MANIFEST_ADAPTER = "nz-candidate-manifest";
const HANSARD_ADAPTER = "nz-hansard";
const MIN_HANSARD_UTTERANCE_LENGTH = 80;

/**
 * Convert reviewed candidate excerpts and exact Hansard speaker turns into a
 * complete immutable corpus draft. Party policy and prose mentions never enter
 * this personal-evidence boundary.
 */
export function buildCandidateCorpusDraft(
  input: CandidateCorpusInput,
): CandidateCorpusBuildResult {
  const candidateByPerson = new Map(
    input.candidates.map((candidate) => [candidate.personId, candidate]),
  );
  const candidateByName = new Map(
    input.candidates.map((candidate) => [
      normalizePersonName(candidate.name),
      candidate,
    ]),
  );
  const sourceById = new Map(
    input.sources.map((source) => [source.id, source]),
  );
  const passages: PassageDraft[] = [];

  for (const source of input.sources) {
    if (source.sourceAdapter !== MANIFEST_ADAPTER || !source.candidateId) {
      continue;
    }
    const candidate = candidateByPerson.get(source.candidateId);
    if (!candidate) continue;
    const text = source.content.trim();
    if (!text) continue;
    const start = source.content.indexOf(text);
    const isTransferablePersonalRecord = source.sourceType === "hansard";
    passages.push(
      passageDraft({
        input,
        source,
        text,
        spanStart: start,
        spanEnd: start + text.length,
        candidate,
        subjectType: isTransferablePersonalRecord ? "person" : "candidacy",
      }),
    );
  }

  for (const utterance of input.utterances) {
    const source = sourceById.get(utterance.evidenceSourceId);
    if (source?.sourceAdapter !== HANSARD_ADAPTER || !utterance.speakerName) {
      continue;
    }
    const candidate = candidateByName.get(
      normalizePersonName(utterance.speakerName),
    );
    if (!candidate) continue;
    const text = utterance.text.trim();
    const spanStart = source.content.indexOf(text);
    if (spanStart < 0) {
      throw new Error(
        `cannot locate Hansard utterance ${source.id}:${utterance.sequence} in durable source`,
      );
    }
    if (text.length < MIN_HANSARD_UTTERANCE_LENGTH) continue;
    passages.push(
      passageDraft({
        input,
        source,
        text,
        spanStart,
        spanEnd: spanStart + text.length,
        candidate,
        subjectType: "person",
      }),
    );
  }

  passages.sort((left, right) => {
    const sourceOrder = left.evidenceSourceId.localeCompare(
      right.evidenceSourceId,
    );
    return sourceOrder || left.spanStart - right.spanStart;
  });

  const coverage = input.candidates.map((candidate) => {
    const candidatePassages = passages.filter(
      (passage) =>
        passage.candidacyId === candidate.candidacyId ||
        passage.personId === candidate.personId,
    );
    return {
      candidateName: candidate.name,
      expectedCoverage: candidate.expectedCoverage,
      passages: candidatePassages.length,
      sources: new Set(
        candidatePassages.map((passage) => passage.evidenceSourceId),
      ).size,
    };
  });

  for (const candidate of coverage) {
    if (
      candidate.expectedCoverage !== "no_reliable_personal_source" &&
      candidate.passages === 0
    ) {
      throw new Error(
        `${candidate.candidateName} expected ${candidate.expectedCoverage} evidence but produced no attributable passage`,
      );
    }
    if (
      candidate.expectedCoverage === "no_reliable_personal_source" &&
      candidate.passages > 0
    ) {
      throw new Error(
        `${candidate.candidateName} is marked without a reliable source but produced evidence`,
      );
    }
  }

  return {
    draft: {
      revision: {
        corpusKey: input.corpusKey,
        sequence: input.sequence,
        status: "draft",
      },
      passages,
    },
    coverage,
  };
}

export interface PublishCandidateCorpusOptions {
  electionId: string;
  raceName: string;
  corpusKey: string;
  manifest: CandidateEvidenceManifest;
  createdAt?: Date;
  dryRun?: boolean;
}

export async function publishCandidateCorpusFromDatabase(
  db: typeof activeDb,
  options: PublishCandidateCorpusOptions,
) {
  if (options.manifest.electionId !== options.electionId) {
    throw new Error("candidate manifest election does not match publication");
  }

  const candidateRows = await db
    .select({
      candidacyId: candidacies.id,
      personId: people.id,
      name: people.name,
    })
    .from(candidacies)
    .innerJoin(races, eq(races.id, candidacies.raceId))
    .innerJoin(people, eq(people.id, candidacies.personId))
    .where(
      and(
        eq(candidacies.electionId, options.electionId),
        eq(races.name, options.raceName),
      ),
    )
    .orderBy(asc(people.name));
  const candidateById = new Map(
    candidateRows.map((candidate) => [candidate.candidacyId, candidate]),
  );
  const candidateByPersonId = new Map(
    candidateRows.map((candidate) => [candidate.personId, candidate]),
  );
  if (
    candidateRows.length !== options.manifest.coverage.length ||
    options.manifest.coverage.some(
      (coverage) =>
        candidateById.get(coverage.candidacyId)?.name !==
        coverage.candidateName,
    )
  ) {
    throw new Error(
      `candidate manifest does not exactly match ${options.raceName} candidacies`,
    );
  }

  const sources = await db
    .select({
      id: evidenceSources.id,
      candidateId: evidenceSources.candidateId,
      sourceAdapter: evidenceSources.sourceAdapter,
      externalId: evidenceSources.externalId,
      sourceType: evidenceSources.sourceType,
      content: evidenceSources.content,
      contentHash: evidenceSources.contentHash,
    })
    .from(evidenceSources)
    .where(eq(evidenceSources.electionId, options.electionId));
  const selectedSources = sources.filter(
    (source) =>
      source.sourceAdapter === HANSARD_ADAPTER ||
      (source.sourceAdapter === MANIFEST_ADAPTER &&
        source.candidateId != null &&
        candidateByPersonId.has(source.candidateId)),
  );
  const hansardSourceIds = selectedSources
    .filter((source) => source.sourceAdapter === HANSARD_ADAPTER)
    .map((source) => source.id);
  const utterances = hansardSourceIds.length
    ? await db
        .select({
          evidenceSourceId: hansardUtterances.evidenceSourceId,
          sequence: hansardUtterances.sequence,
          speakerName: hansardUtterances.speakerName,
          text: hansardUtterances.text,
        })
        .from(hansardUtterances)
        .where(inArray(hansardUtterances.evidenceSourceId, hansardSourceIds))
    : [];
  const sequenceRow = await db
    .select({ sequence: max(corpusRevisions.sequence) })
    .from(corpusRevisions)
    .where(eq(corpusRevisions.corpusKey, options.corpusKey));
  const sequence = (sequenceRow[0]?.sequence ?? 0) + 1;
  const candidates = options.manifest.coverage.map((coverage) => {
    const candidate = candidateById.get(coverage.candidacyId);
    if (!candidate)
      throw new Error(`missing candidacy ${coverage.candidacyId}`);
    return {
      ...candidate,
      expectedCoverage: coverage.status,
    };
  });
  const result = buildCandidateCorpusDraft({
    corpusKey: options.corpusKey,
    sequence,
    createdAt: options.createdAt ?? new Date(),
    candidates,
    sources: selectedSources,
    utterances,
  });
  const publication = options.dryRun
    ? publishCorpusRevision(result.draft)
    : await publishCorpusRevisionTransaction(db, result.draft);

  return { ...result, publication };
}

function passageDraft(options: {
  input: CandidateCorpusInput;
  source: CandidateCorpusSource;
  text: string;
  spanStart: number;
  spanEnd: number;
  candidate: CandidateCorpusCandidate;
  subjectType: "candidacy" | "person";
}): PassageDraft {
  const { input, source, text, spanStart, spanEnd, candidate, subjectType } =
    options;
  const sourceIdentity = source.externalId ?? source.id;
  return {
    corpusRevisionId: `draft:${input.corpusKey}:r${input.sequence}`,
    evidenceSourceId: source.id,
    subjectType,
    candidacyId: subjectType === "candidacy" ? candidate.candidacyId : null,
    personId: subjectType === "person" ? candidate.personId : null,
    officialPartyId: null,
    sourceLineageKey: `${source.sourceAdapter ?? "unknown"}:${sourceIdentity}`,
    contentRevision: requiredContentHash(source),
    contentHash: contentHash(text),
    text,
    spanStart,
    spanEnd,
    status: "complete",
    publishedAt: input.createdAt,
    createdAt: input.createdAt,
    invalidatedAt: null,
    invalidationReason: null,
  };
}

function requiredContentHash(source: CandidateCorpusSource): string {
  if (!source.contentHash) {
    throw new Error(`evidence source ${source.id} is missing a content hash`);
  }
  return source.contentHash;
}

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(HON|RT|MP|DR)\b/g, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
