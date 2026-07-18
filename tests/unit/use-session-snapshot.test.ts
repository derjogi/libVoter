/** @vitest-environment happy-dom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionSnapshot } from "@/lib/client/voter-profile/session-reducer";
import { SESSION_SNAPSHOT_KEY } from "@/lib/client/voter-profile/session-storage";
import { useSessionSnapshot } from "@/lib/client/voter-profile/use-session-snapshot";
import type { SessionSnapshot } from "@/types/voter-claims.zod";

const storedSnapshot: SessionSnapshot = {
  ...createSessionSnapshot({
    createId: () => "00000000-0000-4000-8000-000000000023",
    now: () => "2026-07-19T00:00:00.000Z",
  }),
  selectedRace: "Wellington Central",
};

describe("useSessionSnapshot hydration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useSessionSnapshot> | undefined;

  function Probe() {
    latest = useSessionSnapshot();
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(storedSnapshot));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("never overwrites an existing stored snapshot while hydration effects flush", async () => {
    const writes: SessionSnapshot[] = [];
    const originalSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === SESSION_SNAPSHOT_KEY) {
        writes.push(JSON.parse(value) as SessionSnapshot);
      }
      originalSetItem(key, value);
    });

    await act(async () => {
      root.render(createElement(Probe));
      await Promise.resolve();
    });

    expect(latest?.[2]).toBe(true);
    expect(latest?.[0]).toEqual(storedSnapshot);
    expect(
      JSON.parse(localStorage.getItem(SESSION_SNAPSHOT_KEY) ?? "null"),
    ).toEqual(storedSnapshot);
    expect(
      writes.every(
        (snapshot) => snapshot.sessionId === storedSnapshot.sessionId,
      ),
    ).toBe(true);
  });
});
