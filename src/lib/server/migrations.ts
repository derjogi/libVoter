// Server-only migration utilities
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

export function runMigrations() {
  try {
    // Generate and run migrations
    execSync("drizzle-kit generate", {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    execSync("drizzle-kit migrate", {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    console.log("✅ Migrations applied successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return { success: false, error: String(error) };
  }
}

export function createMigration(name: string) {
  try {
    // Create a custom migration file
    const migrationsDir = path.join(process.cwd(), "drizzle");
    mkdirSync(migrationsDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `${timestamp}_${name}.sql`;
    const filepath = path.join(migrationsDir, filename);

    // Create empty migration file
    writeFileSync(
      filepath,
      `-- Migration: ${name}\n-- Add your SQL statements here\n`,
    );

    console.log(`✅ Migration "${name}" created at ${filepath}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to create migration:", error);
    return { success: false, error: String(error) };
  }
}

export function generateTypes() {
  try {
    execSync("drizzle-kit generate", {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    console.log("✅ Database types generated");
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to generate types:", error);
    return { success: false, error: String(error) };
  }
}
