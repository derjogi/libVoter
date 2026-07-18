import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  corpusRevisions,
  evidencePassages,
  insertEvidencePassageSchema,
} from "@/lib/db/schema";
import {
  invalidateChangedPassages,
  publishCorpusRevision,
} from "@/lib/evidence/corpus-publication";
import { ACCEPTED_EVIDENCE_FIXTURE } from "./fixtures/evidence-corpus";

describe("Spec 024 corpus schema", () => {
  it("stores immutable corpus revisions and explicit normalized passage provenance", () => {
    const revision = getTableConfig(corpusRevisions);
    const passage = getTableConfig(evidencePassages);

    expect(revision.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "corpus_key",
        "sequence",
        "status",
        "content_digest",
        "published_at",
      ]),
    );
    expect(passage.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "corpus_revision_id",
        "evidence_source_id",
        "subject_type",
        "candidacy_id",
        "person_id",
        "official_party_id",
        "source_lineage_key",
        "independence_key",
        "content_revision",
        "content_hash",
        "span_start",
        "span_end",
        "status",
        "invalidated_at",
      ]),
    );
    expect(revision.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "corpus_revisions_key_sequence_unique",
        "corpus_revisions_one_accepted_per_key_unique",
        "corpus_revisions_status_idx",
      ]),
    );
    expect(passage.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "evidence_passages_revision_status_idx",
        "evidence_passages_candidacy_idx",
        "evidence_passages_person_idx",
        "evidence_passages_official_party_idx",
        "evidence_passages_lineage_idx",
      ]),
    );
  });

  it("requires exactly one explicit subject identity and a valid source span", () => {
    const base = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE).passages[0];
    expect(insertEvidencePassageSchema.safeParse(base).success).toBe(true);
    expect(
      insertEvidencePassageSchema.safeParse({
        ...base,
        personId: "person-1",
      }).success,
    ).toBe(false);
    expect(
      insertEvidencePassageSchema.safeParse({
        ...base,
        candidacyId: null,
      }).success,
    ).toBe(false);
    expect(
      insertEvidencePassageSchema.safeParse({
        ...base,
        spanEnd: base.spanStart,
      }).success,
    ).toBe(false);
    expect(
      insertEvidencePassageSchema.safeParse({
        ...base,
        subjectType: "candidate",
      }).success,
    ).toBe(false);
    expect(
      insertEvidencePassageSchema.safeParse({
        ...base,
        status: "published",
      }).success,
    ).toBe(false);
  });
});

describe("deterministic corpus publication and invalidation", () => {
  it("publishes a complete fixture deterministically", () => {
    const first = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE);
    const second = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE);

    expect(first).toEqual(second);
    expect(first.revision.status).toBe("accepted");
    expect(
      first.passages.every((passage) => passage.status === "accepted"),
    ).toBe(true);
    expect(new Set(first.passages.map((passage) => passage.id)).size).toBe(
      first.passages.length,
    );
  });

  it("refuses to publish an incomplete revision", () => {
    expect(() =>
      publishCorpusRevision({
        ...ACCEPTED_EVIDENCE_FIXTURE,
        passages: [
          {
            ...ACCEPTED_EVIDENCE_FIXTURE.passages[0],
            status: "draft",
          },
        ],
      }),
    ).toThrow("complete");
  });

  it("refuses an unverified blank source lineage key", () => {
    expect(() =>
      publishCorpusRevision({
        ...ACCEPTED_EVIDENCE_FIXTURE,
        passages: [
          {
            ...ACCEPTED_EVIDENCE_FIXTURE.passages[0],
            sourceLineageKey: "   ",
          },
        ],
      }),
    ).toThrow("complete");
  });

  it("invalidates only passages whose source content revision changed", () => {
    const published = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE);
    const result = invalidateChangedPassages(
      published.passages,
      [
        {
          evidenceSourceId: published.passages[0].evidenceSourceId,
          contentRevision: "source-r2",
        },
        {
          evidenceSourceId: published.passages[1].evidenceSourceId,
          contentRevision: published.passages[1].contentRevision,
        },
        {
          evidenceSourceId: published.passages[2].evidenceSourceId,
          contentRevision: published.passages[2].contentRevision,
        },
      ],
      new Date("2026-07-19T09:00:00.000Z"),
    );

    expect(result.invalidated.map((passage) => passage.id)).toEqual([
      published.passages[0].id,
    ]);
    expect(result.retained.map((passage) => passage.id)).toEqual([
      published.passages[1].id,
      published.passages[2].id,
    ]);
    expect(result.invalidated[0].status).toBe("invalidated");
    expect(result.invalidated[0].invalidatedAt).toEqual(
      new Date("2026-07-19T09:00:00.000Z"),
    );
  });

  it("invalidates passages when their source was removed", () => {
    const published = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE);
    const invalidatedAt = new Date("2026-07-19T10:00:00.000Z");
    const result = invalidateChangedPassages(
      published.passages,
      published.passages.slice(1).map((passage) => ({
        evidenceSourceId: passage.evidenceSourceId,
        contentRevision: passage.contentRevision,
      })),
      invalidatedAt,
    );

    expect(result.invalidated).toMatchObject([
      {
        id: published.passages[0].id,
        status: "invalidated",
        invalidatedAt,
        invalidationReason: "source removed",
      },
    ]);
  });

  it("derives one independence key from verified duplicate source lineage", () => {
    const published = publishCorpusRevision(ACCEPTED_EVIDENCE_FIXTURE);
    expect(published.passages[0].sourceLineageKey).toBe(
      published.passages[1].sourceLineageKey,
    );
    expect(published.passages[0].independenceKey).toBe(
      "lineage:54708e0bdd9a973f",
    );
    expect(published.passages[1].independenceKey).toBe(
      published.passages[0].independenceKey,
    );
  });
});
