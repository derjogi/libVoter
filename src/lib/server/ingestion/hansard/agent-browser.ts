import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  HansardSearchRequest,
  HansardSearchResponse,
} from "../adapters/hansard";
import { hansardSearchResponseSchema } from "./cache";

const HANSARD_URL = "https://hansard.parliament.nz";

export type BrowserCommandRunner = (
  args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface AgentBrowserHansardClientOptions {
  runner?: BrowserCommandRunner;
  session?: string;
  verificationTimeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface HansardBrowser {
  start(): Promise<void>;
  search(request: HansardSearchRequest): Promise<HansardSearchResponse>;
  transcript(date: string): Promise<string>;
  close(): Promise<void>;
}

export class AgentBrowserHansardClient implements HansardBrowser {
  private readonly runner: BrowserCommandRunner;
  private readonly session: string;
  private readonly verificationTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private closed = false;

  constructor(options: AgentBrowserHansardClientOptions = {}) {
    this.runner = options.runner ?? runAgentBrowserCommand;
    this.session =
      options.session ??
      `lib-voter-hansard-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.verificationTimeoutMs = options.verificationTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async start(): Promise<void> {
    await this.runChecked(["--version"]);
    await this.runJson(["open", HANSARD_URL]);
    const deadline = this.now() + this.verificationTimeoutMs;

    while (true) {
      const result = await this.runJson(["get", "title"]);
      const title = extractTitle(result);
      if (title && title !== "Radware Page") return;
      if (this.now() >= deadline) {
        throw new Error(
          `Hansard browser verification did not complete within ${this.verificationTimeoutMs}ms`,
        );
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  async search(request: HansardSearchRequest): Promise<HansardSearchResponse> {
    const expression = browserFetchExpression(
      "/api/data/search",
      request,
      "POST",
    );
    return hansardSearchResponseSchema.parse(
      await this.runJson(["eval", expression]),
    );
  }

  async transcript(date: string): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid Hansard transcript date: ${date}`);
    }
    const result = await this.runJson([
      "eval",
      browserFetchExpression(`/api/resources/transcript/${date}`),
    ]);
    if (typeof result !== "string") {
      throw new Error(`Hansard transcript ${date} did not return a string`);
    }
    return result;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.runJson(["close"]);
  }

  private async runJson(command: string[]): Promise<unknown> {
    const result = await this.runChecked([
      "--session",
      this.session,
      "--json",
      ...command,
    ]);
    return parseAgentBrowserJson(result.stdout);
  }

  private async runChecked(args: string[]) {
    const result = await this.runner(args);
    if (result.exitCode !== 0) {
      const detail = browserFailureDetail(result.stdout, result.stderr);
      throw new Error(
        `agent-browser ${browserCommandName(args)} failed (${result.exitCode}): ${detail}`,
      );
    }
    return result;
  }
}

function browserFailureDetail(stdout: string, stderr: string): string {
  const stderrText = stderr.trim();
  if (stderrText) return stderrText.slice(0, 2_000);
  const stdoutText = stdout.trim();
  if (!stdoutText) return "no diagnostic output";
  try {
    const value = JSON.parse(stdoutText) as { error?: unknown };
    if (value.error) return String(value.error).slice(0, 2_000);
  } catch {
    // Fall through to bounded raw stdout.
  }
  return stdoutText.slice(0, 2_000);
}

function browserCommandName(args: string[]): string {
  const commands = new Set(["open", "get", "eval", "close"]);
  return args.find((arg) => commands.has(arg)) ?? args[0] ?? "command";
}

export function parseAgentBrowserJson(output: string): unknown {
  let envelope: unknown;
  try {
    envelope = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Invalid agent-browser JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid agent-browser JSON envelope");
  }
  const value = envelope as {
    success?: boolean;
    data?: unknown;
    error?: unknown;
  };
  if (value.success !== true) {
    throw new Error(
      `agent-browser error: ${String(value.error ?? "unknown error")}`,
    );
  }
  const data = value.data;
  if (data && typeof data === "object" && "result" in data) {
    return (data as { result: unknown }).result;
  }
  return data;
}

export async function runAgentBrowserCommand(args: string[]) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>((resolve, reject) => {
    const child = spawn("agent-browser", args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function extractTitle(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "title" in value) {
    const title = (value as { title: unknown }).title;
    return typeof title === "string" ? title : undefined;
  }
  return undefined;
}

function browserFetchExpression(
  url: string,
  body?: unknown,
  method = "GET",
): string {
  const options =
    method === "POST"
      ? `, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(${JSON.stringify(body)})}`
      : "";
  return `fetch(${JSON.stringify(url)}${options}).then(async response => {if (!response.ok) throw new Error("HTTP " + response.status); return response.json();})`;
}
