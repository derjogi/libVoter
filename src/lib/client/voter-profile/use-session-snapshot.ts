"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionSnapshot } from "@/types/voter-claims.zod";
import { createSessionSnapshot } from "./session-reducer";
import {
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "./session-storage";

const browserDependencies = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

export function useSessionSnapshot(): [
  SessionSnapshot,
  React.Dispatch<React.SetStateAction<SessionSnapshot>>,
  boolean,
  () => void,
] {
  const [snapshot, setSnapshot] = useState(() =>
    createSessionSnapshot(browserDependencies),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadSessionSnapshot(window.localStorage);
    if (stored) setSnapshot(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Gate on rendered hydration state, not a ref mutated by the preceding
    // effect. Effects from the initial render share stale `snapshot`, so a ref
    // gate lets that initial value overwrite storage before the loaded snapshot
    // renders.
    if (!hydrated) return;
    saveSessionSnapshot(window.localStorage, snapshot);
  }, [hydrated, snapshot]);

  const clear = useCallback(() => {
    clearSessionSnapshot(window.localStorage);
    setSnapshot(createSessionSnapshot(browserDependencies));
  }, []);

  return [snapshot, setSnapshot, hydrated, clear];
}

export { browserDependencies as sessionReducerDependencies };
