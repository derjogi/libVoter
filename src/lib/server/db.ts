// Server-only libSQL client (cannot be imported in client components)
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { electionConfig } from "../config/election";
import * as schema from "../db/schema";

type DatabaseEnv = Record<string, string | undefined>;

export interface DbClientOptions {
  /** Election database to open. Defaults to the active election. */
  electionId?: string;
  /** Explicit libSQL URL. Takes precedence over electionId. */
  url?: string;
  /** Environment lookup override for tests. Defaults to process.env. */
  env?: DatabaseEnv;
}

function assertSafeElectionId(electionId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(electionId)) {
    throw new Error(`Unsafe election id for database path: ${electionId}`);
  }
  return electionId;
}

export function resolveElectionDbPath(electionId: string): string {
  return `file:./data/elections/${assertSafeElectionId(electionId)}.db`;
}

export function resolveReferenceDbPath(): string {
  return "file:./data/reference.db";
}

export function resolveDatabaseUrl(
  electionId = electionConfig.id,
  env?: DatabaseEnv,
): string {
  return (env ?? process.env).DATABASE_URL || resolveElectionDbPath(electionId);
}

function createDrizzleClient(url: string) {
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN, // Only needed for Turso
  });
  return {
    client,
    db: drizzle(client, { schema }),
  };
}

const active = createDrizzleClient(resolveDatabaseUrl(electionConfig.id));

export const db = active.db;

export const getDbClient = (options: DbClientOptions = {}) => {
  const url =
    options.url ?? resolveDatabaseUrl(options.electionId, options.env);
  return createDrizzleClient(url).db;
};

export const getReferenceDbClient = () => {
  return createDrizzleClient(resolveReferenceDbPath()).db;
};

// Export the client for direct SQL queries if needed
export const libsqlClient = active.client;
