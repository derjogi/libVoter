export interface SessionTurnGuard {
  capture(): number;
  begin(): number | null;
  finish(token: number): void;
  isCurrent(token: number): boolean;
  reset(): void;
}

/**
 * A synchronous submit lock paired with a monotonically increasing session
 * epoch. Reset invalidates every async continuation created in the old session.
 */
export function createSessionTurnGuard(): SessionTurnGuard {
  let epoch = 0;
  let turnActive = false;

  return {
    capture: () => epoch,
    begin: () => {
      if (turnActive) return null;
      turnActive = true;
      return epoch;
    },
    finish: (token) => {
      if (token === epoch) turnActive = false;
    },
    isCurrent: (token) => token === epoch,
    reset: () => {
      epoch += 1;
      turnActive = false;
    },
  };
}
