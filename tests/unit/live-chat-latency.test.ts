// Opt-in LIVE latency check for the configured chat model.
//
// Hits the REAL LLM (OpenRouter etc.), so it is skipped during the normal
// `bun run test` run. Enable it explicitly:
//
//   LIVE_LLM=1 bun run test tests/unit/live-chat-latency.test.ts
//
// or via the npm script: bun run test:latency
//
// Intent: catch a too-slow model config (e.g. a queued `:free` 550B route).
// It fires a simple query several times and asserts that a MAJORITY of runs
// finish under the latency budget. It is deliberately FLAKY-TOLERANT: free
// OpenRouter routes are queued, so an occasional slow run is fine as long as
// most runs are fast. Tune with the env vars below.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Candidate } from "@/types";

// How many times to call the model.
const RUNS = Number(process.env.LATENCY_RUNS || "5");
// Per-run latency budget (ms). A run "passes" if it finishes under this.
const BUDGET_MS = Number(process.env.LATENCY_BUDGET_MS || "20000");
// Minimum number of runs that must come in under budget for the test to pass.
const MIN_PASSES = Number(process.env.LATENCY_MIN_PASSES || "3");
// Hard ceiling per run so a single hung request can't stall the suite forever.
const PER_RUN_TIMEOUT_MS = 180_000;

// Load .env.local into process.env (only fills in keys that aren't already set).
function loadDotEnvLocal() {
  try {
    const file = readFileSync(
      path.resolve(process.cwd(), ".env.local"),
      "utf8",
    );
    for (const line of file.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env.local — the test will skip below if the key is missing.
  }
}

// Resolve gating at collection time (skipIf is evaluated before beforeAll), so
// load .env.local and force real mode here at module scope.
const LIVE = process.env.LIVE_LLM === "1";
if (LIVE) {
  loadDotEnvLocal();
  if (process.env.AI_MODE === "mock") delete process.env.AI_MODE;
}
const HAS_KEY = Boolean(
  process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
);

// A minimal candidate so processMessage can derive the available seat (ward).
const fakeCandidates = [
  {
    id: "1",
    name: "Alex Example",
    party: "Independent",
    seat: "Howick Flat Bush Subdivision",
  },
  {
    id: "2",
    name: "Sam Sample",
    party: "Independent",
    seat: "Howick Flat Bush Subdivision",
  },
] as unknown as Candidate[];

describe.skipIf(!LIVE)("chat model latency (LIVE LLM)", () => {
  it.skipIf(!HAS_KEY)(
    `responds under ${BUDGET_MS}ms in at least ${MIN_PASSES}/${RUNS} runs`,
    { timeout: RUNS * PER_RUN_TIMEOUT_MS },
    async () => {
      const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
      const handler = new AIChatHandler();

      const durations: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const start = performance.now();
        const result = await handler.processMessage(
          "Question: Which of the following areas is most important to you when choosing a candidate?\nAnswer: Economy",
          [],
          [],
          fakeCandidates,
        );
        const elapsed = performance.now() - start;
        durations.push(elapsed);

        // Sanity: the call must actually have produced something.
        expect(typeof result.message).toBe("string");
        expect(result.nextComponent?.type).toBeDefined();

        const ok = elapsed <= BUDGET_MS;
        console.log(
          `[run ${i + 1}/${RUNS}] ${(elapsed / 1000).toFixed(1)}s ${
            ok ? "✓ under" : "✗ over"
          } budget (${(BUDGET_MS / 1000).toFixed(0)}s)`,
        );
      }

      const passes = durations.filter((d) => d <= BUDGET_MS).length;
      const sorted = [...durations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      console.log(
        `\nlatency summary: ${passes}/${RUNS} under ${(BUDGET_MS / 1000).toFixed(0)}s, ` +
          `median ${(median / 1000).toFixed(1)}s, ` +
          `min ${(sorted[0] / 1000).toFixed(1)}s, max ${((sorted.at(-1) ?? 0) / 1000).toFixed(1)}s`,
      );

      expect(
        passes,
        `only ${passes}/${RUNS} runs were under ${BUDGET_MS}ms (need ${MIN_PASSES})`,
      ).toBeGreaterThanOrEqual(MIN_PASSES);
    },
  );
});
