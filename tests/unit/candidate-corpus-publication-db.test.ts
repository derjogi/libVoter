import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import * as dbSchema from "@/lib/db/schema";
import {
  candidacies,
  corpusRevisions,
  elections,
  evidencePassages,
  evidenceSources,
  people,
  races,
} from "@/lib/db/schema";
import { publishCandidateCorpusFromDatabase } from "@/lib/server/evidence/candidate-corpus";
import type { CandidateEvidenceManifest } from "@/lib/server/ingestion/adapters/candidate-evidence-manifest";

const clients: Client[] = [];
const tempDirectories: string[] = [];

const manifest: CandidateEvidenceManifest = {
  version: 1,
  electionId: "nz-2026",
  slice: "test-electorate",
  coverage: [
    {
      candidateName: "Covered Candidate",
      candidacyId: "candidacy-covered",
      status: "covered_by_manifest",
    },
    {
      candidateName: "Uncovered Candidate",
      candidacyId: "candidacy-uncovered",
      status: "no_reliable_personal_source",
      note: "No personal position-bearing source was available.",
    },
  ],
  sources: [
    {
      externalId: "test:covered",
      candidateName: "Covered Candidate",
      candidacyId: "candidacy-covered",
      district: "Test Electorate",
      sourceType: "statement",
      title: "Covered candidate statement",
      url: "https://example.test/covered",
      author: "Covered Candidate",
      content: "I support reliable public transport and safer neighbourhoods.",
    },
  ],
};

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function createDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "candidate-corpus-db-"));
  tempDirectories.push(directory);
  const client = createClient({ url: `file:${join(directory, "corpus.db")}` });
  clients.push(client);
  const db = drizzle(client, { schema: dbSchema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  await db.insert(elections).values({
    id: "nz-2026",
    name: "NZ 2026",
    country: "NZ",
    year: 2026,
    type: "national",
    createdAt,
  });
  await db.insert(races).values({
    id: "race-test",
    electionId: "nz-2026",
    kind: "electorate",
    name: "Test Electorate",
    district: "Test Electorate",
    createdAt,
  });
  await db.insert(people).values([
    { id: "person-covered", name: "Covered Candidate", createdAt },
    { id: "person-uncovered", name: "Uncovered Candidate", createdAt },
  ]);
  await db.insert(candidacies).values([
    {
      id: "candidacy-covered",
      electionId: "nz-2026",
      raceId: "race-test",
      personId: "person-covered",
      createdAt,
    },
    {
      id: "candidacy-uncovered",
      electionId: "nz-2026",
      raceId: "race-test",
      personId: "person-uncovered",
      createdAt,
    },
  ]);
  await db.insert(evidenceSources).values({
    id: "source-covered",
    electionId: "nz-2026",
    candidateId: "person-covered",
    sourceAdapter: "nz-candidate-manifest",
    externalId: "test:covered",
    sourceType: "statement",
    title: "Covered candidate statement",
    url: "https://example.test/covered",
    author: "Covered Candidate",
    content: "I support reliable public transport and safer neighbourhoods.",
    contentHash: "source-hash",
    createdAt,
  });
  return db;
}

describe("candidate corpus database publication", () => {
  it("builds a dry run without writes, then atomically accepts the real revision", async () => {
    const db = await createDatabase();
    const options = {
      electionId: "nz-2026",
      raceName: "Test Electorate",
      corpusKey: "nz-2026:test-electorate:candidates",
      manifest,
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
    };

    const dryRun = await publishCandidateCorpusFromDatabase(db, {
      ...options,
      dryRun: true,
    });
    expect(dryRun.publication.passages).toHaveLength(1);
    expect(await db.select().from(corpusRevisions)).toEqual([]);

    const published = await publishCandidateCorpusFromDatabase(db, options);
    expect(published.coverage).toEqual([
      {
        candidateName: "Covered Candidate",
        expectedCoverage: "covered_by_manifest",
        passages: 1,
        sources: 1,
      },
      {
        candidateName: "Uncovered Candidate",
        expectedCoverage: "no_reliable_personal_source",
        passages: 0,
        sources: 0,
      },
    ]);
    expect(
      await db
        .select({ status: corpusRevisions.status })
        .from(corpusRevisions)
        .where(
          eq(corpusRevisions.corpusKey, "nz-2026:test-electorate:candidates"),
        ),
    ).toEqual([{ status: "accepted" }]);
    expect(await db.select().from(evidencePassages)).toHaveLength(1);
  });
});
