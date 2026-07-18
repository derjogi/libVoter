export type EvidenceSubject =
  | { type: "candidacy"; id: string }
  | { type: "person"; id: string }
  | { type: "official_party"; id: string };

export interface RetrievalHit {
  passageId: string;
  subject: EvidenceSubject;
  score: number;
  independenceKey: string;
}

export interface RetrievalPorts {
  semantic(query: string, subject: EvidenceSubject): Promise<RetrievalHit[]>;
  lexical(query: string, subject: EvidenceSubject): Promise<RetrievalHit[]>;
}

export interface SubjectRetrievalResult {
  subject: EvidenceSubject;
  hits: RetrievalHit[];
  /** Search completion is distinct from finding no relevant evidence. */
  searchComplete: true;
}

export async function retrieveHybridEvidenceBySubject(
  query: string,
  eligibleSubjects: EvidenceSubject[],
  ports: RetrievalPorts,
  options: { perSubjectLimit?: number } = {},
): Promise<SubjectRetrievalResult[]> {
  const perSubjectLimit = options.perSubjectLimit ?? 6;
  if (!Number.isInteger(perSubjectLimit) || perSubjectLimit < 1) {
    throw new Error("perSubjectLimit must be a positive integer");
  }

  return Promise.all(
    eligibleSubjects.map(async (subject) => {
      // Each subject gets both retrieval budgets. There is deliberately no
      // global top-k from which a prolific subject could evict a sparse one.
      const [semantic, lexical] = await Promise.all([
        ports.semantic(query, subject),
        ports.lexical(query, subject),
      ]);
      const byPassage = new Map<
        string,
        RetrievalHit & { semantic: boolean; lexical: boolean }
      >();
      for (const [channel, hits] of [
        ["semantic", semantic],
        ["lexical", lexical],
      ] as const) {
        for (const hit of hits) {
          const previous = byPassage.get(hit.passageId);
          byPassage.set(hit.passageId, {
            ...(previous ?? hit),
            score: Math.max(previous?.score ?? 0, hit.score),
            semantic: previous?.semantic === true || channel === "semantic",
            lexical: previous?.lexical === true || channel === "lexical",
          });
        }
      }

      const ranked = [...byPassage.values()]
        .map((hit) => ({
          ...hit,
          score: hit.score + (hit.semantic && hit.lexical ? 0.05 : 0),
        }))
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.passageId.localeCompare(right.passageId),
        );
      const independent = new Map<string, RetrievalHit>();
      for (const { semantic: _semantic, lexical: _lexical, ...hit } of ranked) {
        if (!independent.has(hit.independenceKey)) {
          independent.set(hit.independenceKey, hit);
        }
      }
      return {
        subject,
        hits: [...independent.values()].slice(0, perSubjectLimit),
        searchComplete: true as const,
      };
    }),
  );
}
