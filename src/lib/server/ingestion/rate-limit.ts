// Conservative, per-host rate limiting (spec 010 compliance).
//
// The runner shares one RateLimiter across an ingestion run so we never hammer
// a source. `now`/`sleep` are injectable purely so the spacing behaviour can
// be unit-tested deterministically without real timers.

export interface RateLimiterOptions {
  /** Minimum gap between requests to the same host, in ms. */
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Last completed-wait timestamp per host. */
  private lastByHost = new Map<string, number>();

  constructor(opts: RateLimiterOptions) {
    this.minIntervalMs = opts.minIntervalMs;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private hostOf(target: string): string {
    try {
      return new URL(target).host;
    } catch {
      return target; // non-URL key (e.g. an adapter id)
    }
  }

  /** Block until it is polite to make the next request to `target`'s host. */
  async wait(target = "*"): Promise<void> {
    const host = this.hostOf(target);
    const last = this.lastByHost.get(host);
    const current = this.now();
    if (last !== undefined) {
      const elapsed = current - last;
      const remaining = this.minIntervalMs - elapsed;
      if (remaining > 0) {
        await this.sleep(remaining);
      }
    }
    this.lastByHost.set(host, this.now());
  }
}
