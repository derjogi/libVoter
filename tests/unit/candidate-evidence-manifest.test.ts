import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAdapters } from "@/lib/server/ingestion/adapters";
import {
  CandidateEvidenceManifestAdapter,
  loadCandidateEvidenceManifest,
} from "@/lib/server/ingestion/adapters/candidate-evidence-manifest";
import { IdentityResolver } from "@/lib/server/ingestion/identity";
import { runIngestion } from "@/lib/server/ingestion/runner";
import { InMemoryEvidenceStore } from "@/lib/server/ingestion/store";

const tempDirectories: string[] = [];

const manifest = {
  version: 1,
  electionId: "nz-2026",
  slice: "auckland-central",
  coverage: [
    {
      candidateName: "Test Candidate",
      candidacyId: "candidacy-test",
      status: "covered_by_manifest",
    },
    {
      candidateName: "No Source Candidate",
      candidacyId: "candidacy-no-source",
      status: "no_reliable_personal_source",
      note: "Only a party affiliation was available.",
    },
  ],
  sources: [
    {
      externalId: "official:test-candidate",
      candidateName: "Test Candidate",
      candidacyId: "candidacy-test",
      district: "Auckland Central",
      sourceType: "statement",
      title: "Test Candidate for Auckland Central",
      url: "https://example.test/candidate",
      author: "Test Candidate",
      publishedAt: "2026-07-01T00:00:00.000Z",
      content: "I support a frequent and affordable public transport network.",
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("CandidateEvidenceManifestAdapter", () => {
  it("loads a versioned manifest and ingests exact attributed text", async () => {
    const directory = join(
      tmpdir(),
      `candidate-evidence-manifest-${crypto.randomUUID()}`,
    );
    tempDirectories.push(directory);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "sources.json");
    await writeFile(path, JSON.stringify(manifest));

    const parsed = await loadCandidateEvidenceManifest(path);
    const [registered] = getAdapters(["nz-candidate-manifest"], {
      candidateEvidenceManifest: parsed,
    });
    expect(registered).toBeInstanceOf(CandidateEvidenceManifestAdapter);
    const adapter = new CandidateEvidenceManifestAdapter(parsed);
    const store = new InMemoryEvidenceStore();
    const result = await runIngestion([adapter], {
      electionId: "nz-2026",
      store,
      resolver: new IdentityResolver({
        candidates: [
          {
            id: "candidacy-test",
            name: "Test Candidate",
            district: "Auckland Central",
          },
        ],
        parties: [],
      }),
    });

    expect(parsed.coverage[1]).toMatchObject({
      candidateName: "No Source Candidate",
      status: "no_reliable_personal_source",
    });
    expect(result).toMatchObject({
      inserted: 1,
      updated: 0,
      unmatched: [],
      errors: [],
    });
    expect(store.rows[0]).toMatchObject({
      candidateId: "candidacy-test",
      sourceAdapter: "nz-candidate-manifest",
      externalId: "official:test-candidate",
      sourceType: "statement",
      title: "Test Candidate for Auckland Central",
      url: "https://example.test/candidate",
      author: "Test Candidate",
      content: "I support a frequent and affordable public transport network.",
    });
  });

  it("rejects sources that are not represented as covered in the manifest", async () => {
    const directory = join(
      tmpdir(),
      `candidate-evidence-manifest-${crypto.randomUUID()}`,
    );
    tempDirectories.push(directory);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "sources.json");
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        coverage: manifest.coverage.map((candidate) =>
          candidate.candidateName === "Test Candidate"
            ? { ...candidate, status: "no_reliable_personal_source" }
            : candidate,
        ),
      }),
    );

    await expect(loadCandidateEvidenceManifest(path)).rejects.toThrow(
      "source candidate must have covered status",
    );
  });

  it("rejects blank, uncited, or mismatched candidate evidence", async () => {
    const directory = join(
      tmpdir(),
      `candidate-evidence-manifest-${crypto.randomUUID()}`,
    );
    tempDirectories.push(directory);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "sources.json");
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        sources: [
          {
            ...manifest.sources[0],
            candidacyId: "wrong-candidacy",
            url: "",
            content: " ",
          },
        ],
      }),
    );

    await expect(loadCandidateEvidenceManifest(path)).rejects.toThrow();
  });
});
