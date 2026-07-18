import {
  type SessionSnapshot,
  sessionSnapshotSchema,
} from "@/types/voter-claims.zod";

export const SESSION_SNAPSHOT_KEY = "lib-voter:v2:session-snapshot";

export const LEGACY_SESSION_KEYS = [
  "lib-voter:session:steps",
  "lib-voter:session:candidates",
  "lib-voter:session:partyMatches",
  "lib-voter:session:availableParties",
  "lib-voter:session:confidence",
  "lib-voter:session:showCandidates",
  "lib-voter:session:availableCandidates",
  "lib-voter:chat:messages",
  "lib-voter:chat:confidence",
  "lib-voter:chat:shouldShowCandidates",
  "lib-voter:chat:followupQuestion",
  "lib-voter:chat:voteLane",
] as const;

function discardLegacyKeys(storage: Storage): void {
  for (const key of LEGACY_SESSION_KEYS) storage.removeItem(key);
}

export function loadSessionSnapshot(storage: Storage): SessionSnapshot | null {
  discardLegacyKeys(storage);
  const raw = storage.getItem(SESSION_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = sessionSnapshotSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid JSON is handled like any other invalid or unknown schema.
  }
  storage.removeItem(SESSION_SNAPSHOT_KEY);
  return null;
}

export function saveSessionSnapshot(
  storage: Storage,
  snapshot: SessionSnapshot,
): void {
  const validated = sessionSnapshotSchema.parse(snapshot);
  storage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(validated));
}

export function clearSessionSnapshot(storage: Storage): void {
  storage.removeItem(SESSION_SNAPSHOT_KEY);
  discardLegacyKeys(storage);
}
