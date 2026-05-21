import { defineConfig } from "@playwright/test";

/**
 * Playwright config. Default scripts in package.json set AI_MODE=mock so the
 * webServer below boots Next with deterministic fixtures and no Chroma
 * dependency. `bun run test:e2e:live` overrides AI_MODE for paid smoke runs.
 */
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "AI_MODE=mock bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AI_MODE: process.env.AI_MODE ?? "mock",
    },
  },
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
});
