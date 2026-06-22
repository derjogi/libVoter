// Adapter registry (spec 010).
//
// Maps `--source` names to adapter factories. NZ 2026 adapters (Electoral
// Commission, Hansard, register of interests, party sites, aggregators) land
// here as they are built — each may be promoted to its own child spec.

import type { SourceAdapter } from "../types";
import { AucklandCandidateAdapter } from "./auckland";
import { NzHansardAdapter } from "./hansard";
import { WikipediaPartyAdapter } from "./wikipedia-party";

export interface AdapterRegistryOptions {
  hansardCacheDir?: string;
  allowPartialHansardCache?: boolean;
}

export const adapterRegistry: Record<
  string,
  (options?: AdapterRegistryOptions) => SourceAdapter
> = {
  auckland: () => new AucklandCandidateAdapter(),
  "nz-hansard": (options) =>
    new NzHansardAdapter({
      cacheDir: options?.hansardCacheDir,
      allowPartialCache: options?.allowPartialHansardCache,
    }),
  "nz-party-policy": () => new WikipediaPartyAdapter(),
};

export function getAdapters(
  names?: string[],
  options: AdapterRegistryOptions = {},
): SourceAdapter[] {
  const wanted =
    names && names.length > 0 ? names : Object.keys(adapterRegistry);
  return wanted.map((name) => {
    const factory = adapterRegistry[name];
    if (!factory) {
      throw new Error(
        `Unknown source "${name}". Available: ${Object.keys(adapterRegistry).join(", ")}`,
      );
    }
    return factory(options);
  });
}
