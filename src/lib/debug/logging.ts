export function newTraceId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${id}`;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const record: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const maybeError = error as Error & {
      cause?: unknown;
      code?: unknown;
      status?: unknown;
      type?: unknown;
      param?: unknown;
      requestID?: unknown;
      error?: unknown;
      headers?: unknown;
    };

    for (const key of [
      "code",
      "status",
      "type",
      "param",
      "requestID",
    ] as const) {
      if (maybeError[key] !== undefined) record[key] = maybeError[key];
    }
    if (maybeError.error !== undefined) record.error = maybeError.error;
    if (maybeError.cause !== undefined)
      record.cause = serializeError(maybeError.cause);
    return record;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    } catch {
      return { value: String(error) };
    }
  }

  return { value: String(error) };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function summarizeForLog(value: unknown, maxLength = 600): unknown {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > maxLength ? `${json.slice(0, maxLength)}…` : value;
  } catch {
    return String(value);
  }
}
