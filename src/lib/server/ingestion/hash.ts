// Content hashing for dedup + change detection (spec 010).
//
// The runner stores `contentHash` per evidence row. Re-running an adapter
// recomputes the hash of the cleaned content: an identical hash means the
// source is unchanged (skip), a different hash for the same URL means the
// source changed (update).

import { createHash } from "node:crypto";

/** Stable SHA-256 hex digest of the cleaned source content. */
export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
