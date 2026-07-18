/** @vitest-environment happy-dom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/lib/client/hooks/useChat";
import type { ChatResponse } from "@/lib/server/ai/chat-handler";

const processChatMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/chat", () => ({ processChatMessage }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useChat session invalidation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useChat> | undefined;

  function Probe() {
    latest = useChat();
    return null;
  }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    processChatMessage.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(Probe)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("clearChat prevents an in-flight response from repopulating cleared state", async () => {
    const pending = deferred<ChatResponse>();
    processChatMessage.mockReturnValueOnce(pending.promise);
    let request!: Promise<ChatResponse>;
    const chat = latest;
    if (!chat) throw new Error("hook did not render");

    await act(async () => {
      request = chat.sendMessage(
        {
          latest: { question: "Question", answer: "Answer" },
          acceptedClaims: [],
          askedCoverage: [],
          confidence: 0,
        },
        [],
      );
      await Promise.resolve();
    });
    expect(latest?.isLoading).toBe(true);

    await act(async () => chat.clearChat());
    expect(latest?.isLoading).toBe(false);

    await act(async () => {
      pending.resolve({
        message: "stale",
        confidence: 91,
        shouldShowCandidates: true,
        followupQuestion: { question: "stale", type: "chat" },
        voteLane: "party",
      });
      await request;
    });

    expect(latest).toMatchObject({
      isLoading: false,
      error: null,
      confidence: 0,
      shouldShowCandidates: false,
      followupQuestion: undefined,
      voteLane: undefined,
    });
  });
});
