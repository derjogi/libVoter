import { describe, expect, it } from "vitest";
import {
  formatPrompt,
  getPrompt,
  getPromptsByCategory,
  PROMPTS,
  validatePromptVariables,
} from "@/lib/server/prompts/index";

describe("formatPrompt", () => {
  it("substitutes every declared variable", () => {
    const tpl = PROMPTS.COMPONENT_SELECTOR;
    const vars: Record<string, any> = {
      conversationState: "state",
      electionYear: 2026,
      electionType: "General",
      electionLocation: "NZ",
      electionKeyTopics: "Housing, Health",
      electionDescription: "NZ general election",
      electionSeatLabelPlural: "electorates",
      electionSeats: "Auckland Central, Wellington Central",
    };
    const out = formatPrompt(tpl, vars);
    expect(out.content).toContain("NZ general election");
    expect(out.content).toContain("Auckland Central");
    expect(out.content).toContain("electorates");
    // No leftover {placeholders}
    expect(out.content).not.toMatch(/\{electionSeats\}|\{electionYear\}/);
  });

  it("throws on missing required variables", () => {
    expect(() => formatPrompt(PROMPTS.COMPONENT_SELECTOR, {})).toThrow(
      /Missing required variables/,
    );
  });
});

describe("validatePromptVariables", () => {
  it("flags missing variables", () => {
    const result = validatePromptVariables(PROMPTS.COMPONENT_SELECTOR, {
      conversationState: "s",
    });
    expect(result.isValid).toBe(false);
    expect(result.missingVariables).toContain("electionYear");
  });
});

describe("prompt registry", () => {
  it("every COMPONENT_SELECTOR-style prompt is registered correctly", () => {
    const tpl = getPrompt("COMPONENT_SELECTOR");
    expect(tpl.id).toBe("component_selector");
    expect(tpl.category).toBe("component_selection");
  });

  it("COMPONENT_SELECTOR instructs the model to ask one focused question", () => {
    const tpl = getPrompt("COMPONENT_SELECTOR");

    expect(tpl.template).toContain("Ask exactly one question");
    expect(tpl.template).toContain(
      "Do not bundle multiple independent questions",
    );
    expect(tpl.template).toContain("dropdown");
    expect(tpl.template).toContain("After a multiselect answer");
  });

  it("getPromptsByCategory returns matching templates", () => {
    const matching = getPromptsByCategory("matching");
    expect(matching.some((p) => p.id === "candidate_matching")).toBe(true);
  });
});
