#!/usr/bin/env bun

import { db } from "../src/lib/server/db";
import { publishCandidateCorpusFromDatabase } from "../src/lib/server/evidence/candidate-corpus";
import { loadCandidateEvidenceManifest } from "../src/lib/server/ingestion/adapters/candidate-evidence-manifest";

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  const equals = process.argv.find((value) => value.startsWith(`${flag}=`));
  return equals?.slice(flag.length + 1);
}

async function main() {
  const electionId = arg("election") ?? "nz-2026";
  const raceName = arg("race") ?? "Auckland Central";
  const corpusKey = arg("corpus-key") ?? "nz-2026:auckland-central:candidates";
  const manifestPath =
    arg("manifest") ?? "data/evidence/nz-2026/auckland-central-sources.json";
  const dryRun = process.argv.includes("--dry-run");
  const json = process.argv.includes("--json");
  const manifest = await loadCandidateEvidenceManifest(manifestPath);
  const result = await publishCandidateCorpusFromDatabase(db, {
    electionId,
    raceName,
    corpusKey,
    manifest,
    dryRun,
  });

  if (json) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          revision: result.publication.revision,
          coverage: result.coverage,
          passages: result.publication.passages.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `${dryRun ? "Built" : "Published"} ${result.publication.revision.id}`,
  );
  console.log(`Passages: ${result.publication.passages.length}`);
  console.log("Candidate coverage:");
  for (const candidate of result.coverage) {
    console.log(
      `  ${candidate.candidateName}: ${candidate.passages} passage(s) from ${candidate.sources} source(s) [${candidate.expectedCoverage}]`,
    );
  }
}

main().catch((error) => {
  console.error(
    "Candidate corpus publication failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
