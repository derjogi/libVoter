import { describe, expect, it, vi } from "vitest";
import type { HansardSearchRequest } from "@/lib/server/ingestion/adapters/hansard";
import {
  AgentBrowserHansardClient,
  type BrowserCommandRunner,
  parseAgentBrowserJson,
} from "@/lib/server/ingestion/hansard/agent-browser";

const request: HansardSearchRequest = {
  searchTab: 1,
  keyword: null,
  types: ["DebateItem"],
  subtypes: ["Speech", "Question", "Vote"],
  parliament: 54,
  dateFrom: "2023-12-05",
  dateTo: null,
  portfolios: [],
  datePeriod: null,
  restrictedFrom: null,
  restrictedTo: null,
  members: [],
  orderByFields: ["SittingDate"],
  pageSize: 1,
  page: 1,
  direction: 1,
};

const ok = (data: unknown) => ({
  stdout: JSON.stringify({ success: true, data, error: null }),
  stderr: "",
  exitCode: 0,
});

describe("AgentBrowserHansardClient", () => {
  it("waits for normal verification and uses only its isolated session", async () => {
    const titles = [
      "Radware Page",
      "Hansard (Debates) — New Zealand Parliament",
    ];
    const runner = vi.fn<BrowserCommandRunner>(async (args) => {
      if (args.includes("--version")) return { ...ok(null), stdout: "0.27.0" };
      if (args.includes("open")) return ok({ title: "Radware Page" });
      if (args.includes("title")) return ok({ title: titles.shift() });
      return ok(null);
    });
    const client = new AgentBrowserHansardClient({
      runner,
      session: "test-hansard",
      pollIntervalMs: 0,
    });

    await client.start();
    await client.close();

    expect(runner).toHaveBeenCalledWith(["--version"]);
    expect(runner).toHaveBeenCalledWith([
      "--session",
      "test-hansard",
      "--json",
      "open",
      "https://hansard.parliament.nz",
    ]);
    expect(runner.mock.calls.flat(2)).not.toContain("cookies");
    expect(runner).toHaveBeenLastCalledWith([
      "--session",
      "test-hansard",
      "--json",
      "close",
    ]);
  });

  it("fails clearly when browser verification never completes", async () => {
    let now = 0;
    const runner: BrowserCommandRunner = async (args) => {
      if (args.includes("--version")) return { ...ok(null), stdout: "0.27.0" };
      if (args.includes("title")) return ok({ title: "Radware Page" });
      return ok(null);
    };
    const client = new AgentBrowserHansardClient({
      runner,
      session: "timeout-test",
      verificationTimeoutMs: 10,
      pollIntervalMs: 5,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });

    await expect(client.start()).rejects.toThrow("verification");
  });

  it("parses search and transcript results returned by page evaluation", async () => {
    const page = {
      page: 1,
      pageSize: 1,
      "@odata.count": 1,
      value: [],
    };
    const runner: BrowserCommandRunner = async (args) => {
      const expression = args.at(-1) ?? "";
      if (expression.includes("/api/data/search")) return ok({ result: page });
      if (expression.includes("/api/resources/transcript")) {
        return ok({ result: "<p>Transcript</p>" });
      }
      return ok(null);
    };
    const client = new AgentBrowserHansardClient({
      runner,
      session: "evaluation-test",
    });

    expect(await client.search(request)).toEqual(page);
    expect(await client.transcript("2024-01-02")).toBe("<p>Transcript</p>");
  });

  it("reports structured stdout when a browser command exits unsuccessfully", async () => {
    const runner: BrowserCommandRunner = async () => ({
      stdout: JSON.stringify({
        success: false,
        data: null,
        error: "browser target closed unexpectedly",
      }),
      stderr: "",
      exitCode: 1,
    });
    const client = new AgentBrowserHansardClient({
      runner,
      session: "failure-details",
    });

    await expect(client.search(request)).rejects.toThrow(
      /agent-browser eval failed.*browser target closed unexpectedly/,
    );
  });
});

describe("parseAgentBrowserJson", () => {
  it("rejects invalid and failed CLI envelopes", () => {
    expect(() => parseAgentBrowserJson("not json")).toThrow("agent-browser");
    expect(() =>
      parseAgentBrowserJson(
        JSON.stringify({ success: false, data: null, error: "boom" }),
      ),
    ).toThrow("boom");
  });
});
