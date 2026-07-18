import { describe, expect, it } from "vitest";
import { createSessionSnapshot } from "@/lib/client/voter-profile/session-reducer";
import {
  LEGACY_SESSION_KEYS,
  loadSessionSnapshot,
  SESSION_SNAPSHOT_KEY,
  saveSessionSnapshot,
} from "@/lib/client/voter-profile/session-storage";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const deps = {
  createId: () => "00000000-0000-4000-8000-000000000001",
  now: () => "2026-07-18T10:00:00.000Z",
};

describe("single voter session snapshot storage", () => {
  it("round-trips only a schema-valid snapshot", () => {
    const storage = new MemoryStorage();
    const snapshot = createSessionSnapshot(deps);
    saveSessionSnapshot(storage, snapshot);
    expect(loadSessionSnapshot(storage)).toEqual(snapshot);
  });

  it("rejects malformed and unknown-version snapshots", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({ schemaVersion: 99 }),
    );
    expect(loadSessionSnapshot(storage)).toBeNull();
    expect(storage.getItem(SESSION_SNAPSHOT_KEY)).toBeNull();
  });

  it("discards legacy split keys without migration", () => {
    const storage = new MemoryStorage();
    for (const key of LEGACY_SESSION_KEYS)
      storage.setItem(key, "sensitive old data");
    expect(loadSessionSnapshot(storage)).toBeNull();
    for (const key of LEGACY_SESSION_KEYS)
      expect(storage.getItem(key)).toBeNull();
  });
});
