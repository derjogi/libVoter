import type {
  EvidencePassageStatus,
  EvidenceSubjectType,
} from "@/lib/db/schema";
import { stableContentId } from "./stable-key";

export interface PassageDraft {
  id?: string;
  corpusRevisionId: string;
  evidenceSourceId: string;
  subjectType: EvidenceSubjectType;
  candidacyId: string | null;
  personId: string | null;
  officialPartyId: string | null;
  sourceLineageKey: string;
  contentRevision: string;
  contentHash: string;
  text: string;
  spanStart: number;
  spanEnd: number;
  status: EvidencePassageStatus;
  publishedAt: Date | null;
  createdAt: Date;
  invalidatedAt?: Date | null;
  invalidationReason?: string | null;
}

export interface CorpusPublicationDraft {
  revision: {
    corpusKey: string;
    sequence: number;
    status: "draft";
  };
  passages: PassageDraft[];
}

export interface PublishedPassage extends PassageDraft {
  id: string;
  independenceKey: string;
  status: "accepted";
  corpusRevisionId: string;
  invalidatedAt: null;
  invalidationReason: null;
}

function passageIdentity(passage: PassageDraft) {
  return {
    evidenceSourceId: passage.evidenceSourceId,
    subjectType: passage.subjectType,
    candidacyId: passage.candidacyId,
    personId: passage.personId,
    officialPartyId: passage.officialPartyId,
    sourceLineageKey: passage.sourceLineageKey,
    contentRevision: passage.contentRevision,
    contentHash: passage.contentHash,
    spanStart: passage.spanStart,
    spanEnd: passage.spanEnd,
  };
}

export function publishCorpusRevision(draft: CorpusPublicationDraft) {
  if (draft.revision.status !== "draft") {
    throw new Error("Only a draft corpus revision can publish");
  }
  if (
    draft.passages.length === 0 ||
    draft.passages.some(
      (passage) =>
        passage.status !== "complete" ||
        !passage.text.trim() ||
        !passage.sourceLineageKey.trim() ||
        passage.spanStart < 0 ||
        passage.spanEnd <= passage.spanStart,
    )
  ) {
    throw new Error("Corpus revision must be complete before publication");
  }

  const contentDigest = stableContentId(
    draft.passages
      .map(passageIdentity)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
  const revisionId = `${draft.revision.corpusKey}:r${draft.revision.sequence}:${contentDigest}`;
  const publishedAt = new Date(
    Math.max(...draft.passages.map((passage) => passage.createdAt.getTime())),
  );
  const passages: PublishedPassage[] = draft.passages.map((passage) => ({
    ...passage,
    id: `passage:${stableContentId({
      revisionId,
      passage: passageIdentity(passage),
    })}`,
    corpusRevisionId: revisionId,
    independenceKey: `lineage:${stableContentId(passage.sourceLineageKey)}`,
    status: "accepted",
    invalidatedAt: null,
    invalidationReason: null,
  }));

  return {
    revision: {
      id: revisionId,
      ...draft.revision,
      status: "accepted" as const,
      contentDigest,
      createdAt: publishedAt,
      publishedAt,
    },
    passages,
  };
}

export function invalidateChangedPassages(
  passages: PublishedPassage[],
  currentSources: Array<{
    evidenceSourceId: string;
    contentRevision: string;
  }>,
  invalidatedAt: Date,
) {
  const revisions = new Map(
    currentSources.map((source) => [
      source.evidenceSourceId,
      source.contentRevision,
    ]),
  );
  const invalidated: Array<
    Omit<PassageDraft, "status"> & {
      id: string;
      corpusRevisionId: string;
      status: "invalidated";
      invalidationReason: string;
    }
  > = [];
  const retained: PublishedPassage[] = [];

  for (const passage of passages) {
    const currentRevision = revisions.get(passage.evidenceSourceId);
    if (currentRevision !== passage.contentRevision) {
      const invalidationReason = currentRevision
        ? `source revision changed to ${currentRevision}`
        : "source removed";
      invalidated.push({
        ...passage,
        status: "invalidated",
        invalidatedAt,
        invalidationReason,
      });
    } else {
      retained.push(passage);
    }
  }
  return { invalidated, retained };
}
