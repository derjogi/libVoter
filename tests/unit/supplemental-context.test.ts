import { describe, expect, it } from "vitest";
import { formatSupplementalContext } from "@/components/dynamic/supplemental-context";

describe("formatSupplementalContext", () => {
  it("returns an empty string when no supplemental context is provided", () => {
    expect(formatSupplementalContext("")).toBe("");
    expect(formatSupplementalContext("   ")).toBe("");
  });

  it("formats supplemental context separately from the structured answer", () => {
    expect(
      formatSupplementalContext("Actually, focus on transport first."),
    ).toBe("\n\nAdditional context:\nActually, focus on transport first.");
  });
});
