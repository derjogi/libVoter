import { describe, expect, it } from "vitest";
import {
  AUCKLAND_2025,
  type ElectionConfig,
  electionConfig,
  NZ_2026,
} from "@/lib/config/election";

describe("ElectionConfig presets", () => {
  it("AUCKLAND_2025 declares ward-style seats", () => {
    expect(AUCKLAND_2025.id).toBe("auckland-2025");
    expect(AUCKLAND_2025.seatLabel).toBe("ward");
    expect(AUCKLAND_2025.seatTypes).toContain("ward");
    expect(AUCKLAND_2025.seatTypes).toContain("mayor");
  });

  it("NZ_2026 declares MMP / electorate seats", () => {
    expect(NZ_2026.id).toBe("nz-2026");
    expect(NZ_2026.votingSystem).toBe("mmp");
    expect(NZ_2026.seatLabel).toBe("electorate");
    expect(NZ_2026.seatTypes).toEqual(
      expect.arrayContaining(["electorate", "list"]),
    );
  });

  it("the active electionConfig is one of the known presets", () => {
    const knownIds: string[] = [AUCKLAND_2025.id, NZ_2026.id];
    expect(knownIds).toContain(electionConfig.id);
  });

  it("every preset exposes the fields callers need", () => {
    const required: (keyof ElectionConfig)[] = [
      "id",
      "name",
      "country",
      "year",
      "type",
      "votingSystem",
      "seatTypes",
      "seatLabel",
      "seatLabelPlural",
      "keyTopics",
      "description",
      "location",
    ];
    for (const cfg of [AUCKLAND_2025, NZ_2026]) {
      for (const field of required) {
        expect(cfg[field], `${cfg.id}.${field}`).toBeDefined();
      }
      expect(Array.isArray(cfg.keyTopics)).toBe(true);
      expect(cfg.keyTopics.length).toBeGreaterThan(0);
    }
  });
});
