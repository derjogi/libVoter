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
//   --election <id>         election id to scope to (default: nz-2026)
//   --limit <n>             cap sources per adapter
//   --since <ISO date>      only sources published on/after this date
//   --hansard-cache <path>  offline Hansard cache from fetch:hansard
//   --candidate-manifest <path> exact reviewed candidate evidence excerpts
//   --allow-partial-cache   permit a bounded Hansard smoke-test cache
//   --min-interval <ms>     min ms between requests per host (default: 2000)
//   --dry-run               resolve + dedup but do not write to the DB
//
// Examples:
//   bun run scripts/ingest-sources.ts --source auckland --dry-run
//   bun run scripts/ingest-sources.ts --election auckland-2025 --limit 20

import { eq } from "drizzle-orm";
import { candidacies, people, races } from "../src/lib/db/schema";
import { db } from "../src/lib/server/db";
import { getAdapters } from "../src/lib/server/ingestion/adapters";
import { loadCandidateEvidenceManifest } from "../src/lib/server/ingestion/adapters/candidate-evidence-manifest";
import type { WikipediaCandidateSource } from "../src/lib/server/ingestion/adapters/wikipedia-candidate";
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
  const electionId = arg("election") ?? "nz-2026";
  const sources = arg("source")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const sinceStr = arg("since");
  const since = sinceStr ? new Date(sinceStr) : undefined;
  const dryRun = hasFlag("dry-run");
  const hansardCacheDir = arg("hansard-cache");
  const candidateManifestPath = arg("candidate-manifest");
  const allowPartialHansardCache = hasFlag("allow-partial-cache");
  const minInterval = arg("min-interval")
    ? Number(arg("min-interval"))
    : undefined;
  const wantsHansard = !sources || sources.includes("nz-hansard");
  const wantsCandidateManifest =
    !sources || sources.includes("nz-candidate-manifest");
  const wantsWikipediaCandidate =
    !sources || sources.includes("wikipedia-candidate");
  if (wantsHansard && !hansardCacheDir) {
    throw new Error(
      "nz-hansard requires --hansard-cache <path>. Run `bun run fetch:hansard` first.",
    );
  }
  if (wantsCandidateManifest && !candidateManifestPath) {
    throw new Error(
      "nz-candidate-manifest requires --candidate-manifest <path>",
    );
  }
  const candidateEvidenceManifest = candidateManifestPath
    ? await loadCandidateEvidenceManifest(candidateManifestPath)
    : undefined;

  let wikipediaCandidateSources: WikipediaCandidateSource[] = [];
  if (wantsWikipediaCandidate) {
    const allCandidacies = await db
      .select()
      .from(candidacies)
      .where(eq(candidacies.electionId, electionId));
    const allPeople = await db.select().from(people);
    const allRaces = await db.select().from(races);
    const peopleMap = new Map(allPeople.map((person) => [person.id, person]));
    const racesMap = new Map(allRaces.map((race) => [race.id, race]));

    wikipediaCandidateSources = allCandidacies
      .filter(
        (candidacy) =>
          Array.isArray(candidacy.supportingLinks) &&
          candidacy.supportingLinks.length > 0,
      )
      .map((candidacy) => {
        const person = peopleMap.get(candidacy.personId);
        const race = racesMap.get(candidacy.raceId);
        const wikiUrl = (candidacy.supportingLinks as string[])[0];
        return {
          candidateName: person?.name ?? "",
          district: race?.district ?? race?.name ?? "",
          wikiUrl,
        };
      })
      .filter((source): source is WikipediaCandidateSource =>
        Boolean(source.candidateName && source.district && source.wikiUrl),
      );

    if (wikipediaCandidateSources.length === 0) {
      console.warn(
        `No Wikipedia candidate sources found for election=${electionId}`,
      );
    }
  }

  console.log(
    `Ingesting election=${electionId} sources=${sources?.join(",") ?? "all"}` +
      `${limit ? ` limit=${limit}` : ""}${dryRun ? " (dry-run)" : ""}`,
  );

  const adapters = getAdapters(sources, {
    hansardCacheDir,
    allowPartialHansardCache,
    candidateEvidenceManifest,
    wikipediaCandidateSources,
  });
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
    minIntervalMs: minInterval,
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
