import { describe, expect, it } from "vitest";
import { createSessionTurnGuard } from "@/lib/client/voter-profile/session-turn-guard";

describe("session turn guard", () => {
  it("invalidates every token captured before reset", () => {
    const guard = createSessionTurnGuard();
    const hydration = guard.capture();
    const turn = guard.begin();

    expect(turn).not.toBeNull();
    if (turn === null) throw new Error("expected the first turn to start");
    expect(guard.isCurrent(hydration)).toBe(true);
    expect(guard.isCurrent(turn)).toBe(true);

    guard.reset();

    expect(guard.isCurrent(hydration)).toBe(false);
    expect(guard.isCurrent(turn)).toBe(false);
  });

  it("synchronously rejects a second submit until the active turn finishes", () => {
    const guard = createSessionTurnGuard();
    const first = guard.begin();

    expect(first).not.toBeNull();
    if (first === null) throw new Error("expected the first turn to start");
    expect(guard.begin()).toBeNull();

    guard.finish(first);
    expect(guard.begin()).not.toBeNull();
  });
});
