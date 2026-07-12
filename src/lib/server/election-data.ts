import type { Client } from "@libsql/client";
import type { ElectionConfig } from "@/lib/config/election";
import { electionConfig } from "@/lib/config/election";
import { getDbConnection, libsqlClient } from "@/lib/server/db";
import type { Candidate, PartySummary } from "@/types";

export interface ElectionDataRepository {
  listSeats(): Promise<string[]>;
  getCandidatesForSeat(seat: string): Promise<Candidate[]>;
  listParties(): Promise<PartySummary[]>;
}

type AdapterKind = "generic" | "legacy";
const required: Record<string, string[]> = {
  races: ["id", "election_id", "kind", "name", "district"],
  candidacies: [
    "id",
    "election_id",
    "race_id",
    "person_id",
    "party_id",
    "legacy_candidate_id",
    "candidate_statement",
    "key_positions",
    "why",
    "key_skills",
    "top_issues",
    "supporting_links",
    "created_at",
  ],
  people: ["id", "name", "photo_url"],
  election_parties: ["id", "election_id", "name", "leader"],
};

async function columns(client: Client, table: string): Promise<Set<string>> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function detect(client: Client): Promise<AdapterKind> {
  const tables = new Set(
    (
      await client.execute("SELECT name FROM sqlite_schema WHERE type='table'")
    ).rows.map((row) => String(row.name)),
  );
  const genericPresent = Object.keys(required).filter((table) =>
    tables.has(table),
  );
  if (genericPresent.length === Object.keys(required).length) {
    for (const [table, names] of Object.entries(required)) {
      const actual = await columns(client, table);
      const missing = names.filter((name) => !actual.has(name));
      if (missing.length)
        throw new Error(
          `Unsupported partial generic election schema: ${table} missing ${missing.join(", ")}`,
        );
    }
    return "generic";
  }
  if (genericPresent.length)
    throw new Error(
      `Unsupported partial generic election schema: found ${genericPresent.join(", ")}`,
    );
  if (
    tables.has("candidates") &&
    (await columns(client, "candidates")).has("ward")
  )
    return "legacy";
  throw new Error("Unsupported election database schema");
}

export function createElectionDataRepository(
  client: Client = libsqlClient,
  config: ElectionConfig = electionConfig,
): ElectionDataRepository {
  let capability: Promise<AdapterKind> | undefined;
  const kind = () => {
    if (!capability) capability = detect(client);
    return capability;
  };
  return {
    async listSeats() {
      if ((await kind()) === "legacy") {
        const result = await client.execute(
          "SELECT DISTINCT ward AS seat FROM candidates WHERE ward <> 'Mayor' ORDER BY ward",
        );
        return result.rows.map((row) => String(row.seat));
      }
      const kinds = config.seatTypes.filter(
        (item) => item !== "mayor" && item !== "list",
      );
      if (!kinds.length) return [];
      const placeholders = kinds.map(() => "?").join(",");
      const result = await client.execute({
        sql: `SELECT DISTINCT COALESCE(district, name) AS seat FROM races WHERE election_id = ? AND kind IN (${placeholders}) ORDER BY name`,
        args: [config.id, ...kinds],
      });
      return result.rows.map((row) => String(row.seat));
    },
    async getCandidatesForSeat(seat) {
      const legacy = (await kind()) === "legacy";
      const result = legacy
        ? await client.execute({
            sql: "SELECT id, name, party, ward AS seat, candidate_statement, key_positions, why, key_skills, top_issues, supporting_links, photo_url, created_at FROM candidates WHERE ward = ? ORDER BY name",
            args: [seat],
          })
        : await client.execute({
            sql: "SELECT c.id AS candidacy_id, c.legacy_candidate_id, p.name, ep.name AS party, COALESCE(r.district, r.name) AS seat, c.candidate_statement, c.key_positions, c.why, c.key_skills, c.top_issues, c.supporting_links, p.photo_url, c.created_at FROM candidacies c JOIN races r ON r.id=c.race_id JOIN people p ON p.id=c.person_id LEFT JOIN election_parties ep ON ep.id=c.party_id WHERE c.election_id=? AND (r.district=? OR r.name=?) ORDER BY p.name",
            args: [config.id, seat, seat],
          });
      return result.rows.map((row) => ({
        id: String(
          legacy ? row.id : (row.legacy_candidate_id ?? row.candidacy_id),
        ),
        name: String(row.name),
        party: row.party == null ? null : String(row.party),
        seat: String(row.seat),
        candidate_statement:
          row.candidate_statement == null
            ? null
            : String(row.candidate_statement),
        key_positions:
          row.key_positions == null
            ? null
            : JSON.parse(String(row.key_positions)),
        why: row.why == null ? null : String(row.why),
        key_skills: row.key_skills == null ? null : String(row.key_skills),
        top_issues: row.top_issues == null ? null : String(row.top_issues),
        supporting_links:
          row.supporting_links == null
            ? null
            : JSON.parse(String(row.supporting_links)),
        photo_url: row.photo_url == null ? null : String(row.photo_url),
        created_at: new Date(Number(row.created_at) * 1000),
      }));
    },
    async listParties() {
      if ((await kind()) === "legacy") {
        const result = await client.execute(
          "SELECT CAST(id AS TEXT) AS id, name, NULL AS leader FROM parties ORDER BY name",
        );
        return result.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          leader: null,
        }));
      }
      const result = await client.execute({
        sql: "SELECT id, name, leader FROM election_parties WHERE election_id=? ORDER BY name",
        args: [config.id],
      });
      return result.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        leader: row.leader == null ? null : String(row.leader),
      }));
    },
  };
}

export const electionDataRepository = createElectionDataRepository();
export const repositoryForDatabase = (url: string, config: ElectionConfig) =>
  createElectionDataRepository(getDbConnection({ url }).client, config);
