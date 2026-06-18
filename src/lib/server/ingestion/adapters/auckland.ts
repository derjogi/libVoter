// Auckland 2025 candidate-statement adapter (spec 010).
//
// The first SourceAdapter, refactored from scripts/scrape-candidates.ts. It
// proves the runner/identity/dedup plumbing on the known Auckland dataset
// before NZ sources are added. By default it reads the committed scrape
// output (data/all-candidates.json) so ingestion is deterministic and offline;
// re-scraping the live site stays in scripts/scrape-candidates.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { htmlToText } from "../text";
import type {
  AdapterContext,
  NormalizedSource,
  RawSource,
  SourceAdapter,
  SourceRef,
} from "../types";

interface AucklandCandidate {
  name: string;
  ward: string;
  link: string;
  details: {
    candidate_statement?: string;
    key_positions?: Record<string, string>;
    why?: string;
    key_skills?: string;
    top_issues?: string;
    supporting_links?: string[];
    photo_url?: string;
  };
}

const DEFAULT_JSON = path.join(process.cwd(), "data", "all-candidates.json");

export class AucklandCandidateAdapter implements SourceAdapter {
  readonly name = "auckland";
  readonly elections = ["auckland-2025"] as const;

  constructor(private readonly jsonPath: string = DEFAULT_JSON) {}

  async discover(_ctx: AdapterContext): Promise<SourceRef[]> {
    const raw = await readFile(this.jsonPath, "utf-8");
    const candidates = JSON.parse(raw) as AucklandCandidate[];
    return candidates
      .filter((c) => c.name && c.ward)
      .map((c) => ({
        url: c.link,
        candidateName: c.name,
        district: c.ward,
        sourceType: "statement" as const,
        title: `${c.name} — candidate statement`,
        meta: { candidate: c },
      }));
  }

  // Data is already local, so "fetch" just surfaces the discovered payload.
  async fetch(ref: SourceRef, _ctx: AdapterContext): Promise<RawSource | null> {
    const candidate = ref.meta?.candidate as AucklandCandidate | undefined;
    if (!candidate) return null;
    const body = buildStatementText(candidate);
    if (!body) return null;
    return { ...ref, raw: body };
  }

  async normalize(
    raw: RawSource,
    ctx: AdapterContext,
  ): Promise<NormalizedSource> {
    return {
      electionId: ctx.electionId,
      candidateName: raw.candidateName,
      district: raw.district,
      sourceType: "statement",
      title: raw.title,
      url: raw.url,
      content: htmlToText(raw.raw),
    };
  }
}

/** Assemble a candidate's profile fields into one readable document. */
function buildStatementText(c: AucklandCandidate): string {
  const d = c.details ?? {};
  const parts: string[] = [];
  if (d.candidate_statement) parts.push(d.candidate_statement);
  if (d.why) parts.push(`Why I want to be elected: ${d.why}`);
  if (d.key_skills) parts.push(`Key skills and qualities: ${d.key_skills}`);
  if (d.top_issues) parts.push(`Top key issues: ${d.top_issues}`);
  if (d.key_positions && Object.keys(d.key_positions).length > 0) {
    parts.push("Positions on key topics:");
    for (const [topic, stance] of Object.entries(d.key_positions)) {
      parts.push(`${topic}: ${stance}`);
    }
  }
  return parts.join("\n").trim();
}
