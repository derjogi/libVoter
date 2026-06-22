import path from "node:path";

export interface FetchHansardArgs {
  cacheDir: string;
  since: string;
  limitPages?: number;
  limitDates?: number;
  refresh: boolean;
  minIntervalMs: number;
}

export function parseFetchHansardArgs(args: string[]): FetchHansardArgs {
  validateOptions(args);
  const cache = arg(args, "cache") ?? path.join("data", "hansard-cache");
  const since = arg(args, "since") ?? "2023-12-05";
  if (!isDateOnly(since)) throw new Error(`Invalid --since value: ${since}`);

  return {
    cacheDir: path.resolve(cache),
    since,
    limitPages: optionalInteger(args, "limit-pages", 1),
    limitDates: optionalInteger(args, "limit-dates", 1),
    refresh: args.includes("--refresh"),
    minIntervalMs: optionalInteger(args, "min-interval-ms", 0) ?? 1_000,
  };
}

const VALUE_OPTIONS = new Set([
  "cache",
  "since",
  "limit-pages",
  "limit-dates",
  "min-interval-ms",
]);
const BOOLEAN_OPTIONS = new Set(["refresh"]);

function validateOptions(args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const name = token.slice(2).split("=", 1)[0];
    if (!VALUE_OPTIONS.has(name) && !BOOLEAN_OPTIONS.has(name)) {
      throw new Error(
        `Unknown option --${name}. To fetch a small sample, use --limit-pages and --limit-dates.`,
      );
    }
    if (!token.includes("=") && VALUE_OPTIONS.has(name)) index += 1;
  }
}

export function arg(args: string[], name: string): string | undefined {
  const flag = `--${name}`;
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  const equals = args.find((value) => value.startsWith(`${flag}=`));
  return equals?.slice(flag.length + 1);
}

function optionalInteger(
  args: string[],
  name: string,
  minimum: number,
): number | undefined {
  const raw = arg(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid --${name} value: ${raw}`);
  }
  return value;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
