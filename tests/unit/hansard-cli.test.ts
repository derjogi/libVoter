import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFetchHansardArgs } from "@/lib/server/ingestion/hansard/cli";

describe("parseFetchHansardArgs", () => {
  it("provides conservative full-term defaults", () => {
    expect(parseFetchHansardArgs([])).toEqual({
      cacheDir: path.join(process.cwd(), "data", "hansard-cache"),
      since: "2023-12-05",
      refresh: false,
      minIntervalMs: 1_000,
    });
  });

  it("parses bounded smoke and refresh options", () => {
    expect(
      parseFetchHansardArgs([
        "--cache=/tmp/hansard",
        "--since",
        "2024-01-01",
        "--limit-pages",
        "2",
        "--limit-dates=3",
        "--min-interval-ms",
        "0",
        "--refresh",
      ]),
    ).toEqual({
      cacheDir: "/tmp/hansard",
      since: "2024-01-01",
      limitPages: 2,
      limitDates: 3,
      refresh: true,
      minIntervalMs: 0,
    });
  });

  it.each([
    ["--since", "yesterday"],
    ["--limit-pages", "0"],
    ["--limit-dates", "nope"],
    ["--min-interval-ms", "-1"],
  ])("rejects invalid %s values before acquisition", (flag, value) => {
    expect(() => parseFetchHansardArgs([flag, value])).toThrow(flag);
  });
});
