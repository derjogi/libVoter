"use client";

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

const STORAGE_PREFIX = "lib-voter:";

// Matches an ISO 8601 date string with milliseconds & timezone, which is what
// `JSON.stringify(new Date())` produces.
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function reviveDates(value: unknown): unknown {
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveDates(v);
    }
    return out;
  }
  return value;
}

/**
 * Like `useState`, but persists the value to `localStorage` under
 * `lib-voter:<key>` and restores it after mount.
 *
 * Returns `[value, setValue, isHydrated, clear]` where:
 *  - `isHydrated` becomes `true` once we have read from `localStorage` (so
 *    callers can avoid running "initial setup" effects against the unloaded
 *    default value).
 *  - `clear()` removes the entry and resets back to `initial`.
 *
 * The value is JSON-serialised; ISO date strings produced by `JSON.stringify`
 * on `Date` instances are revived back into `Date`s on load.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, boolean, () => void] {
  const fullKey = STORAGE_PREFIX + key;
  const [state, setState] = useState<T>(initial);
  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Load once on mount (client-side only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(fullKey);
      if (raw !== null) {
        setState(reviveDates(JSON.parse(raw)) as T);
      }
    } catch (err) {
      console.warn(`usePersistedState: failed to load ${fullKey}`, err);
    } finally {
      hydratedRef.current = true;
      setIsHydrated(true);
    }
    // We intentionally only run this on mount for the given key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // Persist on change, but skip the very first render so we don't overwrite
  // stored data with the initial default before the load effect runs.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(state));
    } catch (err) {
      console.warn(`usePersistedState: failed to persist ${fullKey}`, err);
    }
  }, [fullKey, state]);

  const clear = () => {
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      // Ignore (e.g. storage disabled).
    }
    setState(initial);
  };

  return [state, setState, isHydrated, clear];
}
