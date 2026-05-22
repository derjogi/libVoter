// Server-only libSQL client (cannot be imported in client components)
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema";

const client = createClient({
  url: process.env.DATABASE_URL || "file:./voting-advisor.db",
  authToken: process.env.DATABASE_AUTH_TOKEN, // Only needed for Turso
});

export const db = drizzle(client, { schema });

export const getDbClient = () => {
  const client = createClient({
    url: process.env.DATABASE_URL || "file:./voting-advisor.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
};

// Export the client for direct SQL queries if needed
export { client as libsqlClient };
