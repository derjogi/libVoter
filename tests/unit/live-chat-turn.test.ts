// Manual / opt-in live test for the combined structured chat turn.
//
// This hits the REAL LLM (OpenRouter etc.) so it is skipped during the normal
// `bun run test` run. Enable it explicitly:
//
//   LIVE_LLM=1 bun run test tests/unit/live-chat-turn.test.ts
//
// or via the helper script: ./run_script.sh
//
// It loads .env.local itself and forces real (non-mock) mode, then drives
// AIChatHandler.processMessage and prints the chosen component so you can
// eyeball that the model picks a sensible interactive component (and not, say,
// a degenerate slider) for a fixed-choice question.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Candidate } from "@/lib/db/schema";

// The free OpenRouter models can be very slow / queued, so default to a single
// run and give each run a generous budget. Bump LIVE_LLM_RUNS for variety checks.
const RUNS = Number(process.env.LIVE_LLM_RUNS || "1");
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
    id: 1,
    name: "Alex Example",
    party: "Independent",
    ward: "Howick Flat Bush Subdivision",
  },
  {
    id: 2,
    name: "Sam Sample",
    party: "Independent",
    ward: "Howick Flat Bush Subdivision",
  },
] as unknown as Candidate[];

describe.skipIf(!LIVE)("AIChatHandler.processMessage (LIVE LLM)", () => {
  it.skipIf(!HAS_KEY)(
    "picks a sensible interactive component for a fixed-choice question",
    { timeout: RUNS * PER_RUN_TIMEOUT_MS },
    async () => {
      const { AIChatHandler } = await import("@/lib/server/ai/chat-handler");
      const handler = new AIChatHandler();

      for (let i = 0; i < RUNS; i++) {
        const result = await handler.processMessage(
          "Question: Which of the following areas is most important to you when choosing a candidate?\nAnswer: Economy",
          [],
          [],
          fakeCandidates,
        );

        const comp = result.nextComponent;
        // biome-ignore lint/suspicious/noConsole: manual test output
        console.log(
          `\n[run ${i + 1}] type=${comp?.type}\n`,
          JSON.stringify(result, null, 2),
        );

        expect(typeof result.message).toBe("string");
        expect(comp?.type).toBeDefined();

        // A "which area matters most" question should not become a chat/freetext
        // dump, and a slider (if chosen) must have a real range.
        if (comp?.type === "slider") {
          expect(comp.data.min).toBeLessThan(comp.data.max);
        }
      }
    },
  );
});
