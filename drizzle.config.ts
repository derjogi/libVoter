import { defineConfig } from "drizzle-kit";

const electionId = process.env.ELECTION_ID || "nz-2026";
const databaseUrl =
  process.env.DATABASE_URL || `file:./data/elections/${electionId}.db`;

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
});
