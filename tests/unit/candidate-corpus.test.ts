import { describe, expect, it } from "vitest";
import {
  buildCandidateCorpusDraft,
  type CandidateCorpusInput,
} from "@/lib/server/evidence/candidate-corpus";

const createdAt = new Date("2026-07-19T00:00:00.000Z");

const input: CandidateCorpusInput = {
  corpusKey: "nz-2026:auckland-central:candidates",
  sequence: 1,
  createdAt,
  candidates: [
    {
      candidacyId: "candidacy-antonia",
      personId: "person-antonia",
      name: "Antonia Modkova",
      expectedCoverage: "no_reliable_personal_source",
    },
    {
      candidacyId: "candidacy-candace",
      personId: "person-candace",
      name: "Candace Kinser",
      expectedCoverage: "covered_by_manifest",
    },
    {
      candidacyId: "candidacy-chloe",
      personId: "person-chloe",
      name: "Chlöe Swarbrick",
      expectedCoverage: "covered_by_hansard",
    },
    {
      candidacyId: "candidacy-naisi",
      personId: "person-naisi",
      name: "Naisi Chen",
      expectedCoverage: "covered_by_manifest",
    },
  ],
  sources: [
    {
      id: "source-candace",
      candidateId: "person-candace",
      sourceAdapter: "nz-candidate-manifest",
      externalId: "national:candace",
      sourceType: "statement",
      content:
        "I support safe and connected communities and a thriving Queen Street.",
      contentHash: "hash-candace",
    },
    {
      id: "source-naisi",
      candidateId: "person-naisi",
      sourceAdapter: "nz-candidate-manifest",
      externalId: "hansard-53:naisi",
      sourceType: "hansard",
      content:
        "Digital platforms should fairly compensate New Zealand journalism and support democracy.",
      contentHash: "hash-naisi",
    },
    {
      id: "source-chloe",
      candidateId: null,
      sourceAdapter: "nz-hansard",
      externalId: "hansard-54:chloe",
      sourceType: "hansard",
      content:
        "CHLÖE SWARBRICK\nWe need enduring climate action and fair public services for everyone in Aotearoa.",
      contentHash: "hash-chloe",
    },
    {
      id: "source-party",
      candidateId: null,
      sourceAdapter: "nz-party-policy",
      externalId: "party:act",
      sourceType: "party_policy",
      content: "This party text must not become Antonia's personal evidence.",
      contentHash: "hash-party",
    },
  ],
  utterances: [
    {
      evidenceSourceId: "source-chloe",
      sequence: 1,
      speakerName: "CHLÖE SWARBRICK",
      text: "We need enduring climate action and fair public services for everyone in Aotearoa.",
    },
    {
      evidenceSourceId: "source-chloe",
      sequence: 2,
      speakerName: "OTHER MEMBER",
      text: "Chlöe Swarbrick was mentioned, but this is not her own statement.",
    },
  ],
};

describe("buildCandidateCorpusDraft", () => {
  it("keeps exact Hansard speaker turns and reviewed manifest excerpts in separate subject lanes", () => {
    const result = buildCandidateCorpusDraft(input);

    expect(result.draft.revision).toEqual({
      corpusKey: "nz-2026:auckland-central:candidates",
      sequence: 1,
      status: "draft",
    });
    expect(result.draft.passages).toHaveLength(3);
    expect(
      result.draft.passages.map((passage) => ({
        source: passage.evidenceSourceId,
        subjectType: passage.subjectType,
        candidacyId: passage.candidacyId,
        personId: passage.personId,
        text: passage.text,
      })),
    ).toEqual([
      {
        source: "source-candace",
        subjectType: "candidacy",
        candidacyId: "candidacy-candace",
        personId: null,
        text: "I support safe and connected communities and a thriving Queen Street.",
      },
      {
        source: "source-chloe",
        subjectType: "person",
        candidacyId: null,
        personId: "person-chloe",
        text: "We need enduring climate action and fair public services for everyone in Aotearoa.",
      },
      {
        source: "source-naisi",
        subjectType: "person",
        candidacyId: null,
        personId: "person-naisi",
        text: "Digital platforms should fairly compensate New Zealand journalism and support democracy.",
      },
    ]);
    expect(result.coverage).toEqual([
      {
        candidateName: "Antonia Modkova",
        expectedCoverage: "no_reliable_personal_source",
        passages: 0,
        sources: 0,
      },
      {
        candidateName: "Candace Kinser",
        expectedCoverage: "covered_by_manifest",
        passages: 1,
        sources: 1,
      },
      {
        candidateName: "Chlöe Swarbrick",
        expectedCoverage: "covered_by_hansard",
        passages: 1,
        sources: 1,
      },
      {
        candidateName: "Naisi Chen",
        expectedCoverage: "covered_by_manifest",
        passages: 1,
        sources: 1,
      },
    ]);
  });

  it("fails closed when expected coverage produced no attributable passage", () => {
    expect(() =>
      buildCandidateCorpusDraft({
        ...input,
        utterances: [],
      }),
    ).toThrow("Chlöe Swarbrick expected covered_by_hansard evidence");
  });

  it("fails when a Hansard utterance cannot be cited to its source span", () => {
    expect(() =>
      buildCandidateCorpusDraft({
        ...input,
        utterances: [
          {
            evidenceSourceId: "source-chloe",
            sequence: 1,
            speakerName: "CHLÖE SWARBRICK",
            text: "This text is not present in the durable source.",
          },
        ],
      }),
    ).toThrow("cannot locate Hansard utterance");
  });
});
