#!/usr/bin/env bun

// Acquire official Parliament 54 Hansard data into a resumable local cache.

import { acquireHansardCorpus } from "../src/lib/server/ingestion/hansard/acquire";
import { AgentBrowserHansardClient } from "../src/lib/server/ingestion/hansard/agent-browser";
import { parseFetchHansardArgs } from "../src/lib/server/ingestion/hansard/cli";

async function main() {
  const options = parseFetchHansardArgs(process.argv.slice(2));
  console.log(`Hansard cache: ${options.cacheDir}`);
  console.log(`Term start: ${options.since}`);

  const result = await acquireHansardCorpus({
    ...options,
    browser: new AgentBrowserHansardClient(),
    onProgress: (message) => console.log(message),
  });

  console.log("\n=== Hansard acquisition result ===");
  console.log(`  pages:      ${result.completedPages.length}`);
  console.log(`  dates:      ${result.completedDates.length}`);
  console.log(`  documents:  ${result.totalDocuments ?? "unknown"}`);
  console.log(`  complete:   ${result.complete}`);
  console.log(`  failures:   ${result.failures.length}`);
  for (const failure of result.failures.slice(0, 20)) {
    console.log(`   - [${failure.kind}] ${failure.key}: ${failure.message}`);
  }
  if (result.failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    "Hansard acquisition failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
