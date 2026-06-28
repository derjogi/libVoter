#!/usr/bin/env bun
// Chunk + embed the active election's evidence_sources into its per-election
// Chroma vector store (spec 017), e.g. `evidence-nz-2026`. If the collection
// already has chunks it is loaded as-is; --repopulate replaces that derived
// collection before re-embedding.
//
// Usage:
//   bun run scripts/embed-evidence.ts                 # populate if empty
//   bun run scripts/embed-evidence.ts --repopulate    # force re-embed
//   bun run scripts/embed-evidence.ts --query "climate" --party nz-2026-party-green

import { VectorStoreManager } from "../src/lib/server/rag/vector-store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const repopulate = process.argv.includes("--repopulate");
  const store = new VectorStoreManager();
  await store.initialize({ seedIfEmpty: !repopulate });

  if (repopulate) {
    console.log("Re-embedding evidence_sources…");
    const n = await store.repopulate();
    console.log(`Embedded ${n} chunks.`);
  }

  const query = arg("query") ?? "cost of living, housing and climate";
  const party = arg("party");
  const election = arg("election") ?? "nz-2026";
  console.log(
    `\nQuery: "${query}"  filter: election=${election} party=${party ?? "-"}`,
  );

  const chunks = await store.query(
    query,
    {
      electionId: election,
      partyIds: party ? [party] : undefined,
    },
    5,
  );

  console.log(`\nTop ${chunks.length} chunks:`);
  for (const c of chunks) {
    console.log(
      `  [${c.score.toFixed(3)}] ${c.sourceType} party=${c.partyId ?? "-"} ` +
        `${c.sourceUrl ?? ""}\n    ${c.content.slice(0, 140).replace(/\n/g, " ")}…`,
    );
  }
}

main().catch((err) => {
  console.error("embed-evidence failed:", err);
  process.exitCode = 1;
});
