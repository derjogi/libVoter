#!/usr/bin/env bun
// Evidence-source ingestion CLI (spec 010).
//
// Selects adapters, builds the election-scoped identity index, then runs the
// shared pipeline (discover → fetch → normalize → resolve → dedup → upsert)
// into evidence_sources.
//
// Usage:
//   bun run scripts/ingest-sources.ts [flags]
//   --source <name[,name]>  adapters to run (default: all registered)
//   --election <id>         election id to scope to (default: auckland-2025)
//   --limit <n>             cap sources per adapter
//   --since <ISO date>      only sources published on/after this date
//   --dry-run               resolve + dedup but do not write to the DB
//
// Examples:
//   bun run scripts/ingest-sources.ts --source auckland --dry-run
//   bun run scripts/ingest-sources.ts --election auckland-2025 --limit 20

import { db } from "../src/lib/server/db";
import { getAdapters } from "../src/lib/server/ingestion/adapters";
import { IdentityResolver } from "../src/lib/server/ingestion/identity";
import { buildIdentityIndex } from "../src/lib/server/ingestion/identity-index";
import { runIngestion } from "../src/lib/server/ingestion/runner";
import { DrizzleEvidenceStore } from "../src/lib/server/ingestion/store";

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.split("=").slice(1).join("=") : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const electionId = arg("election") ?? "auckland-2025";
  const sources = arg("source")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const sinceStr = arg("since");
  const since = sinceStr ? new Date(sinceStr) : undefined;
  const dryRun = hasFlag("dry-run");

  console.log(
    `Ingesting election=${electionId} sources=${sources?.join(",") ?? "all"}` +
      `${limit ? ` limit=${limit}` : ""}${dryRun ? " (dry-run)" : ""}`,
  );

  const adapters = getAdapters(sources);
  const index = await buildIdentityIndex(electionId, db);
  console.log(
    `Identity index: ${index.candidates.length} candidates, ${index.parties.length} parties`,
  );

  const result = await runIngestion(adapters, {
    electionId,
    store: new DrizzleEvidenceStore(db),
    resolver: new IdentityResolver(index),
    limit,
    since,
    dryRun,
    log: (m) => console.log(m),
  });

  console.log("\n=== Ingestion result ===");
  console.log(`  inserted: ${result.inserted}`);
  console.log(`  updated:  ${result.updated}`);
  console.log(`  skipped:  ${result.skipped}`);
  console.log(`  unmatched:${result.unmatched.length}`);
  if (result.unmatched.length > 0) {
    console.log("\n  Unmatched records (not stored):");
    for (const u of result.unmatched.slice(0, 50)) {
      console.log(
        `   - [${u.sourceType}] ${u.candidateName ?? u.partyName ?? "?"}` +
          `${u.district ? ` (${u.district})` : ""}${u.url ? ` ${u.url}` : ""}`,
      );
    }
    if (result.unmatched.length > 50) {
      console.log(`   … and ${result.unmatched.length - 50} more`);
    }
  }
  if (result.errors.length > 0) {
    console.log(`\n  Errors: ${result.errors.length}`);
    for (const e of result.errors.slice(0, 20)) {
      console.log(`   - [${e.adapter}] ${e.ref ?? ""} ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exitCode = 1;
});
