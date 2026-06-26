// Benchmark & compare chat-model latency.
//
// Runs the SAME structured chat-turn-style call (jsonSchema method, like the
// real AIChatHandler) against one or more models and prints a latency table so
// you can quickly see which model is actually fast.
//
// Usage:
//   bun run bench:models                       # benchmark the default model list
//   bun run bench:models <model> [<model> ...] # benchmark specific models
//   RUNS=5 bun run bench:models <model>        # override runs per model
//
// Examples:
//   bun run bench:models qwen/qwen3-next-80b-a3b-instruct:free meta-llama/llama-3.2-3b-instruct:free
//   bun run bench:models openai/gpt-4o-mini google/gemini-2.5-flash
//
// Models are routed exactly like the app config (see parseModelString), so
// `:free` routes, `openrouter/...`, and bare `author/model` ids all work.
import { z } from "zod";
import { parseModelString } from "@/lib/server/ai/config";
import { createChatModel } from "@/lib/server/ai/model-factory";

// A tiny structured schema that mirrors the shape of a real chat turn so the
// model does comparable work (a short reply + a small structured object).
const BenchSchema = z.object({
  message: z.string().describe("A short, friendly one-sentence reply"),
  topic: z.string().describe("A single key topic word inferred from the input"),
});

const PROMPT =
  "The voter said the economy is the most important issue to them. " +
  "Reply briefly and name the single key topic.";

const RUNS = Number(process.env.RUNS || "3");

const DEFAULT_MODELS = [
  "openrouter/google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free", // Should also use openrouter
  "openrouter/openai/gpt-oss-20b:free",
  "openrouter/openai/gpt-4o-mini", // Not free! but relatively cheap, want to compare.
  "openai/gpt-4o-mini", // won't work because I don't have an API key for it with credits; but... just for illustration purposes ;-)
];

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function benchModel(modelId: string): Promise<{
  model: string;
  runs: number[];
  errors: number;
}> {
  // Force live mode for the benchmark even if the shell has AI_MODE=mock.
  if (process.env.AI_MODE === "mock") delete process.env.AI_MODE;

  const model = createChatModel(parseModelString(modelId));
  const structured = (
    model as unknown as {
      withStructuredOutput: (
        schema: unknown,
        config?: unknown,
      ) => { invoke: (m: unknown) => Promise<unknown> };
    }
  ).withStructuredOutput(BenchSchema, {
    name: "bench_turn",
    method: "jsonSchema",
  });

  const runs: number[] = [];
  let errors = 0;

  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    try {
      await structured.invoke(PROMPT);
      const elapsed = performance.now() - start;
      runs.push(elapsed);
      console.log(`  ${modelId}  run ${i + 1}/${RUNS}: ${fmt(elapsed)}`);
    } catch (error) {
      errors++;
      const elapsed = performance.now() - start;
      console.log(
        `  ${modelId}  run ${i + 1}/${RUNS}: ERROR after ${fmt(elapsed)} — ${
          (error as Error).message
        }`,
      );
    }
  }

  return { model: modelId, runs, errors };
}

async function main() {
  const models = process.argv.slice(2);
  const targets = models.length > 0 ? models : DEFAULT_MODELS;

  console.log(
    `\nBenchmarking ${targets.length} model(s), ${RUNS} run(s) each — comparable structured chat-turn call.\n`,
  );

  const results: Awaited<ReturnType<typeof benchModel>>[] = [];
  for (const modelId of targets) {
    console.log(`▶ ${modelId}`);
    results.push(await benchModel(modelId));
    console.log("");
  }

  // Summary table sorted by median latency (failed-only models sink to bottom).
  const rows = results
    .map((r) => {
      const ok = r.runs.length > 0;
      return {
        model: r.model,
        median: ok ? median(r.runs) : Number.POSITIVE_INFINITY,
        min: ok ? Math.min(...r.runs) : Number.POSITIVE_INFINITY,
        max: ok ? Math.max(...r.runs) : Number.POSITIVE_INFINITY,
        ok: r.runs.length,
        errors: r.errors,
      };
    })
    .sort((a, b) => a.median - b.median);

  const nameWidth = Math.max(...rows.map((r) => r.model.length), 5);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log("=".repeat(nameWidth + 40));
  console.log(
    `${pad("MODEL", nameWidth)}  ${pad("median", 8)}${pad("min", 8)}${pad("max", 8)}ok/err`,
  );
  console.log("-".repeat(nameWidth + 40));
  for (const r of rows) {
    const med = Number.isFinite(r.median) ? fmt(r.median) : "—";
    const mn = Number.isFinite(r.min) ? fmt(r.min) : "—";
    const mx = Number.isFinite(r.max) ? fmt(r.max) : "—";
    console.log(
      `${pad(r.model, nameWidth)}  ${pad(med, 8)}${pad(mn, 8)}${pad(mx, 8)}${r.ok}/${r.errors}`,
    );
  }
  console.log("=".repeat(nameWidth + 40));
  console.log("\nFastest by median is listed first.\n");
}

main().catch((error) => {
  console.error("bench-models failed:", error);
  process.exit(1);
});
