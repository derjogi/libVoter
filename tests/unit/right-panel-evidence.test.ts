/** @vitest-environment happy-dom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateModal } from "@/components/candidates/CandidateModal";
import { PartyModal } from "@/components/candidates/PartyModal";
import { RightPanel } from "@/components/layout/RightPanel";
import type { CandidateMatch, PartyMatch } from "@/types";

vi.mock("@/lib/actions/prompts", () => ({
  summarizeUserPreferences: vi.fn(),
}));

const party: PartyMatch = {
  party: { id: "party-1", name: "Example Party", leader: "Alex Leader" },
  score: 81,
  reasoning: "Full party reasoning that must not be truncated in details.",
  topMatchingPolicies: ["Public transport"],
  sources: [
    {
      title: "Party policy",
      url: "https://example.test/party-policy",
      excerpt: "A cited party-policy excerpt.",
    },
  ],
  evidenceStatus: "available",
};

const candidate: CandidateMatch = {
  candidate: {
    candidacyId: "candidacy-1",
    personId: "person-1",
    partyId: "party-1",
    name: "Casey Candidate",
    party: "Example Party",
    seat: "Example Seat",
    candidate_statement: null,
    key_positions: null,
    why: null,
    key_skills: null,
    top_issues: null,
    supporting_links: null,
    photo_url: null,
    created_at: new Date("2026-01-01"),
  },
  score: 75,
  reasoning: "Candidate match reasoning.",
  pros: [],
  cons: [],
  topMatchingPolicies: [],
  candidateSources: [],
  partySources: party.sources,
  candidateEvidenceStatus: "unavailable",
  partyEvidenceStatus: "available",
};

describe("right-panel evidence details", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("renders open party details through the dialog portal", async () => {
    await act(async () => {
      root.render(
        createElement(PartyModal, {
          party,
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });

    expect(document.body.textContent).toContain("Example Party");
    expect(document.body.textContent).toContain("Full party reasoning");
    expect(document.body.textContent).toContain(
      "A cited party-policy excerpt.",
    );
    const link = document.body.querySelector(
      'a[href="https://example.test/party-policy"]',
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each([
    "javascript:alert(document.domain)",
    "data:text/html,unsafe",
    "not a URL",
  ])("renders unsafe party citation %s as non-linked text", async (url) => {
    await act(async () => {
      root.render(
        createElement(PartyModal, {
          party: {
            ...party,
            sources: [{ title: "Unsafe party source", url }],
          },
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });

    expect(document.body.textContent).toContain("Unsafe party source");
    expect(
      Array.from(document.body.querySelectorAll("a")).find(
        (link) => link.getAttribute("href") === url,
      ),
    ).toBeUndefined();
  });

  it.each([
    "javascript:alert(document.domain)",
    "data:text/html,unsafe",
    "not a URL",
  ])("renders unsafe candidate citation %s as non-linked text", async (url) => {
    await act(async () => {
      root.render(
        createElement(CandidateModal, {
          candidate: {
            ...candidate,
            candidateSources: [{ title: "Unsafe candidate source", url }],
          },
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });

    expect(document.body.textContent).toContain("Unsafe candidate source");
    expect(
      Array.from(document.body.querySelectorAll("a")).find(
        (link) => link.getAttribute("href") === url,
      ),
    ).toBeUndefined();
  });

  it("renders an HTTPS candidate citation as a protected new-tab link", async () => {
    await act(async () => {
      root.render(
        createElement(CandidateModal, {
          candidate: {
            ...candidate,
            candidateSources: [
              {
                title: "Candidate policy",
                url: "https://example.test/candidate-policy",
              },
            ],
          },
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });

    const link = document.body.querySelector(
      'a[href="https://example.test/candidate-policy"]',
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each([
    ["empty", "No party evidence was found"],
    ["unavailable", "Party evidence is currently unavailable"],
  ] as const)("shows %s party evidence status copy", async (status, copy) => {
    await act(async () => {
      root.render(
        createElement(PartyModal, {
          party: { ...party, sources: [], evidenceStatus: status },
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
    });
    expect(document.body.textContent).toContain(copy);
  });

  it("opens party evidence separately and separates candidate evidence lanes", async () => {
    await act(async () => {
      root.render(
        createElement(RightPanel, {
          candidates: [candidate],
          partyMatches: [party],
          confidence: 80,
        }),
      );
    });

    expect(document.body.textContent).not.toContain("Full party reasoning");
    const partyButton = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="View evidence for Example Party"]',
    );
    expect(partyButton).not.toBeNull();
    await act(async () => partyButton?.click());
    expect(document.body.textContent).toContain("Full party reasoning");
    expect(
      document.body.querySelector(
        'a[href="https://example.test/party-policy"]',
      ),
    ).not.toBeNull();

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')
        ?.click();
    });
    const candidateCard = Array.from(document.body.querySelectorAll("h3"))
      .find((heading) => heading.textContent === "Casey Candidate")
      ?.closest("[data-slot=card]") as HTMLElement | null;
    await act(async () => candidateCard?.click());
    expect(document.body.textContent).toContain("Candidate evidence");
    expect(document.body.textContent).toContain("Party evidence");
    expect(document.body.textContent).toContain(
      "Candidate evidence is currently unavailable",
    );
  });

  it("uses a named non-button candidate card with Enter and Space activation", async () => {
    await act(async () => {
      root.render(
        createElement(RightPanel, {
          candidates: [candidate],
          partyMatches: [],
          confidence: 80,
        }),
      );
    });

    const trigger = document.body.querySelector<HTMLElement>(
      '[data-slot="card"][role="button"][aria-label="View details for Casey Candidate"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.tagName).not.toBe("BUTTON");
    expect(trigger?.tabIndex).toBe(0);
    expect(trigger?.querySelector("button")).toBeNull();
    expect(trigger?.querySelector('[aria-label="Info"]')).toBeNull();

    trigger?.focus();
    expect(document.activeElement).toBe(trigger);
    await act(async () => {
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')
        ?.click();
    });
    const spaceEvent = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => trigger?.dispatchEvent(spaceEvent));
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
