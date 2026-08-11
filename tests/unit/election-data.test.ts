import { type Client, createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { NZ_2026 } from "@/lib/config/election";
import { createElectionDataRepository } from "@/lib/server/election-data";

const clients: Client[] = [];

function memoryClient() {
  const client = createClient({ url: ":memory:" });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function createLegacySchema(client: Client) {
  await client.batch([
    "CREATE TABLE candidates (id INTEGER PRIMARY KEY, name TEXT NOT NULL, party TEXT, ward TEXT NOT NULL, candidate_statement TEXT, key_positions TEXT, why TEXT, key_skills TEXT, top_issues TEXT, supporting_links TEXT, photo_url TEXT, created_at INTEGER NOT NULL)",
    "CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    "INSERT INTO candidates VALUES (7, 'Legacy Person', 'Legacy Party', 'Legacy Seat', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1700000000)",
  ]);
}

async function createGenericSchema(client: Client) {
  await client.batch([
    "CREATE TABLE races (id TEXT PRIMARY KEY, election_id TEXT, kind TEXT, name TEXT, district TEXT)",
    "CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, photo_url TEXT)",
    "CREATE TABLE election_parties (id TEXT PRIMARY KEY, election_id TEXT, name TEXT, leader TEXT)",
    "CREATE TABLE candidacies (id TEXT PRIMARY KEY, election_id TEXT, race_id TEXT, person_id TEXT, party_id TEXT, legacy_candidate_id INTEGER, candidate_statement TEXT, key_positions TEXT, why TEXT, key_skills TEXT, top_issues TEXT, supporting_links TEXT, created_at INTEGER)",
  ]);
}

describe("election data repository", () => {
  it("translates a legacy database without leaking its storage field", async () => {
    const client = memoryClient();
    await createLegacySchema(client);
    const repository = createElectionDataRepository(client, NZ_2026);

    expect(await repository.listSeats()).toEqual(["Legacy Seat"]);
    const candidates = await repository.getCandidatesForSeat("Legacy Seat");
    expect(candidates).toMatchObject([
      {
        id: "7",
        candidacyId: "7",
        personId: "7",
        partyId: null,
        name: "Legacy Person",
        seat: "Legacy Seat",
      },
    ]);
    expect(candidates[0]).not.toHaveProperty("ward");
  });

  it("uses a complete generic schema even when legacy rows exist", async () => {
    const client = memoryClient();
    await createLegacySchema(client);
    await createGenericSchema(client);
    const repository = createElectionDataRepository(client, NZ_2026);

    expect(await repository.listSeats()).toEqual([]);
    expect(await repository.getCandidatesForSeat("Legacy Seat")).toEqual([]);
  });

  it("maps generic candidacies to stable string IDs and seats", async () => {
    const client = memoryClient();
    await createGenericSchema(client);
    await client.batch([
      "INSERT INTO races VALUES ('race-1', 'nz-2026', 'electorate', 'Test Electorate', 'Test Electorate')",
      "INSERT INTO people VALUES ('person-1', 'Generic Person', NULL)",
      "INSERT INTO election_parties VALUES ('party-1', 'nz-2026', 'Generic Party', NULL)",
      "INSERT INTO candidacies VALUES ('candidacy-1', 'nz-2026', 'race-1', 'person-1', 'party-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1700000000)",
    ]);
    const repository = createElectionDataRepository(client, NZ_2026);

    expect(await repository.listSeats()).toEqual(["Test Electorate"]);
    expect(
      await repository.getCandidatesForSeat("Test Electorate"),
    ).toMatchObject([
      {
        id: "candidacy-1",
        candidacyId: "candidacy-1",
        personId: "person-1",
        partyId: "party-1",
        name: "Generic Person",
        party: "Generic Party",
        seat: "Test Electorate",
      },
    ]);
  });

  it("rejects partial and unsupported schemas explicitly", async () => {
    const partial = memoryClient();
    await partial.execute(
      "CREATE TABLE races (id TEXT, election_id TEXT, kind TEXT, name TEXT, district TEXT)",
    );
    await expect(
      createElectionDataRepository(partial, NZ_2026).listSeats(),
    ).rejects.toThrow(/partial generic election schema/i);

    const unsupported = memoryClient();
    await unsupported.execute("CREATE TABLE unrelated (id TEXT)");
    await expect(
      createElectionDataRepository(unsupported, NZ_2026).listSeats(),
    ).rejects.toThrow(/unsupported election database schema/i);
  });
});
