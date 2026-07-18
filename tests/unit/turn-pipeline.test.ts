import { describe, expect, it, vi } from "vitest";
import { startTurnPipeline } from "@/lib/client/voter-profile/turn-pipeline";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("turn pipeline", () => {
  it("starts next-question and extraction work before awaiting either", async () => {
    const question = deferred<string>();
    const extraction = deferred<string>();
    const startQuestion = vi.fn(() => question.promise);
    const startExtraction = vi.fn(() => extraction.promise);

    const pipeline = startTurnPipeline(startQuestion, startExtraction);

    expect(startQuestion).toHaveBeenCalledOnce();
    expect(startExtraction).toHaveBeenCalledOnce();

    question.resolve("next question");
    await expect(pipeline.question).resolves.toBe("next question");
    extraction.resolve("claim result");
    await expect(pipeline.extraction).resolves.toBe("claim result");
  });
});
