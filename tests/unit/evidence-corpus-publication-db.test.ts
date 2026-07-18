import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as dbSchema from "@/lib/db/schema";
import {
  candidacies,
  corpusRevisions,
  electionParties,
  elections,
  evidencePassages,
  evidenceSources,
  people,
  races,
} from "@/lib/db/schema";
import { publishCorpusRevisionTransaction } from "@/lib/server/evidence/corpus-publication";
import { ACCEPTED_EVIDENCE_FIXTURE } from "./fixtures/evidence-corpus";

const clients: Client[] = [];
const tempDirectories: string[] = [];

async function createCorpusDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "lib-voter-corpus-"));
  tempDirectories.push(directory);
  const client = createClient({ url: `file:${join(directory, "corpus.db")}` });
  clients.push(client);
  const db = drizzle(client, { schema: dbSchema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(elections).values({
    id: "nz-2026",
    name: "NZ 2026",
    country: "NZ",
    year: 2026,
    type: "national",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(races).values({
    id: "race-1",
    electionId: "nz-2026",
    kind: "electorate",
    name: "Test Electorate",
    district: "Test Electorate",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(people).values({
    id: "person-1",
    name: "Test Person",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(electionParties).values({
    id: "party-1",
    electionId: "nz-2026",
    name: "Test Party",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(candidacies).values({
    id: "candidacy-1",
    electionId: "nz-2026",
    raceId: "race-1",
    personId: "person-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(evidenceSources).values(
    ACCEPTED_EVIDENCE_FIXTURE.passages.map((passage) => ({
      id: passage.evidenceSourceId,
      electionId: "nz-2026",
      sourceType: "statement" as const,
      content: passage.text,
      contentHash: passage.contentHash,
      createdAt: passage.createdAt,
    })),
  );
  return db;
}

beforeEach(() => {
  clients.length = 0;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("durable corpus publication", () => {
  it("atomically publishes a complete revision and supersedes its predecessor", async () => {
    const db = await createCorpusDatabase();
    const first = await publishCorpusRevisionTransaction(
      db,
      ACCEPTED_EVIDENCE_FIXTURE,
    );
    const secondDraft = {
      ...ACCEPTED_EVIDENCE_FIXTURE,
      revision: { ...ACCEPTED_EVIDENCE_FIXTURE.revision, sequence: 2 },
      passages: ACCEPTED_EVIDENCE_FIXTURE.passages.map((passage, index) =>
        index === 0
          ? {
              ...passage,
              contentRevision: "source-r2",
              contentHash: "hash-candidate-policy-r2",
              text: "I support faster regional rail services with cost controls.",
            }
          : passage,
      ),
    };

    const second = await publishCorpusRevisionTransaction(db, secondDraft);

    expect(
      await db
        .select({ id: corpusRevisions.id, status: corpusRevisions.status })
        .from(corpusRevisions)
        .where(eq(corpusRevisions.corpusKey, "nz-2026-campaign"))
        .orderBy(asc(corpusRevisions.sequence)),
    ).toEqual([
      { id: first.revision.id, status: "superseded" },
      { id: second.revision.id, status: "accepted" },
    ]);
    expect(
      await db
        .select({ id: evidencePassages.id })
        .from(evidencePassages)
        .where(
          and(
            eq(evidencePassages.corpusRevisionId, second.revision.id),
            eq(evidencePassages.status, "accepted"),
          ),
        ),
    ).toHaveLength(second.passages.length);
  });

  it("rolls back superseding when any new passage cannot publish", async () => {
    const db = await createCorpusDatabase();
    const first = await publishCorpusRevisionTransaction(
      db,
      ACCEPTED_EVIDENCE_FIXTURE,
    );
    const brokenDraft = {
      ...ACCEPTED_EVIDENCE_FIXTURE,
      revision: { ...ACCEPTED_EVIDENCE_FIXTURE.revision, sequence: 2 },
      passages: ACCEPTED_EVIDENCE_FIXTURE.passages.map((passage, index) =>
        index === 0
          ? { ...passage, evidenceSourceId: "removed-source" }
          : passage,
      ),
    };

    await expect(
      publishCorpusRevisionTransaction(db, brokenDraft),
    ).rejects.toThrow();

    expect(
      await db
        .select({ id: corpusRevisions.id })
        .from(corpusRevisions)
        .where(eq(corpusRevisions.status, "accepted")),
    ).toEqual([{ id: first.revision.id }]);
    expect(await db.select().from(corpusRevisions)).toHaveLength(1);
  });

  it("enforces only one accepted revision per corpus key in SQLite", async () => {
    const db = await createCorpusDatabase();
    await publishCorpusRevisionTransaction(db, ACCEPTED_EVIDENCE_FIXTURE);

    await expect(
      db.insert(corpusRevisions).values({
        id: "illegal-second-accepted",
        corpusKey: "nz-2026-campaign",
        sequence: 99,
        status: "accepted",
        contentDigest: "illegal",
        createdAt: new Date("2026-07-19T00:00:00.000Z"),
        publishedAt: new Date("2026-07-19T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select({ id: corpusRevisions.id })
        .from(corpusRevisions)
        .where(eq(corpusRevisions.status, "accepted")),
    ).toHaveLength(1);
  });
});
