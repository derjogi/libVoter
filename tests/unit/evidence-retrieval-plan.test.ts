import { describe, expect, it, vi } from "vitest";
import {
  type RetrievalHit,
  retrieveHybridEvidenceBySubject,
} from "@/lib/evidence/hybrid-retrieval";

const subjects = [
  { type: "candidacy" as const, id: "candidacy-prolific" },
  { type: "person" as const, id: "person-sparse" },
  { type: "official_party" as const, id: "party-1" },
];

function hit(
  passageId: string,
  subject: (typeof subjects)[number],
  score: number,
  independenceKey = passageId,
): RetrievalHit {
  return { passageId, subject, score, independenceKey };
}

describe("hybrid evidence retrieval planning", () => {
  it("queries semantic and lexical retrieval independently for every eligible subject", async () => {
    const semantic = vi.fn(
      async (_query: string, subject: (typeof subjects)[number]) =>
        subject.id === "person-sparse" ? [hit("sparse-sem", subject, 0.7)] : [],
    );
    const lexical = vi.fn(
      async (_query: string, subject: (typeof subjects)[number]) =>
        subject.id === "person-sparse" ? [hit("sparse-lex", subject, 0.6)] : [],
    );

    const result = await retrieveHybridEvidenceBySubject(
      "regional rail",
      subjects,
      { semantic, lexical },
      { perSubjectLimit: 2 },
    );

    expect(semantic).toHaveBeenCalledTimes(3);
    expect(lexical).toHaveBeenCalledTimes(3);
    expect(result.map((entry) => entry.subject)).toEqual(subjects);
    expect(result[1].hits.map((entry) => entry.passageId)).toEqual([
      "sparse-sem",
      "sparse-lex",
    ]);
    expect(result[0].searchComplete).toBe(true);
    expect(result[0].hits).toEqual([]);
  });

  it("bounds and deduplicates results within each subject without global starvation", async () => {
    const prolific = subjects[0];
    const sparse = subjects[1];
    const semantic = vi.fn(
      async (_query: string, subject: (typeof subjects)[number]) => {
        if (subject.id === prolific.id) {
          return Array.from({ length: 20 }, (_, index) =>
            hit(`p-${index}`, subject, 1 - index / 100),
          );
        }
        return subject.id === sparse.id ? [hit("s-1", subject, 0.2)] : [];
      },
    );
    const lexical = vi.fn(
      async (_query: string, subject: (typeof subjects)[number]) =>
        subject.id === sparse.id
          ? [
              hit("s-copy", subject, 0.9, "same-source"),
              hit("s-1", subject, 0.8),
            ]
          : [],
    );

    const result = await retrieveHybridEvidenceBySubject(
      "housing",
      subjects,
      { semantic, lexical },
      { perSubjectLimit: 2 },
    );

    expect(result[0].hits).toHaveLength(2);
    expect(result[1].hits.map((entry) => entry.passageId)).toContain("s-1");
    expect(new Set(result[1].hits.map((entry) => entry.passageId)).size).toBe(
      result[1].hits.length,
    );
  });

  it("deduplicates copied lineage to one independence contribution", async () => {
    const subject = subjects[2];
    const semantic = async () => [hit("original", subject, 0.9, "speech-42")];
    const lexical = async () => [hit("mirror", subject, 0.95, "speech-42")];

    const [result] = await retrieveHybridEvidenceBySubject(
      "health",
      [subject],
      { semantic, lexical },
    );

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].passageId).toBe("mirror");
  });
});
