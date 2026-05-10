import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComponentSpecSchema,
  parseComponentSpec,
  parseQuestionResponse,
  SAFE_FALLBACK_COMPONENT,
} from "@/types/components.zod";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parseComponentSpec", () => {
  it("accepts a valid multiselect spec", () => {
    const raw = JSON.stringify({
      component: "multiselect",
      reasoning: "top issues",
      data: {
        question: "Which issues matter?",
        options: [
          { id: "housing", label: "Housing", description: "" },
          { id: "transport", label: "Transport", description: "" },
        ],
        maxSelections: 3,
      },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
    expect(spec.component).toBe("multiselect");
    if (spec.component === "multiselect") {
      expect(spec.data.options).toHaveLength(2);
    }
  });

  it("accepts a valid yesno spec", () => {
    const raw = JSON.stringify({
      component: "yesno",
      data: {
        statements: [
          { statement: "I support more public transport investment." },
          { statement: "Property taxes should be lowered.", context: "fiscal" },
        ],
      },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
    expect(spec.component).toBe("yesno");
  });

  it("accepts a valid slider spec", () => {
    const raw = JSON.stringify({
      component: "slider",
      data: { label: "How much?", min: 0, max: 10 },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
  });

  it("falls back when JSON is invalid", () => {
    const { spec, ok, error } = parseComponentSpec("not json {{{");
    expect(ok).toBe(false);
    expect(error).toMatch(/JSON/i);
    expect(spec).toEqual(SAFE_FALLBACK_COMPONENT);
  });

  it("falls back when component name is unknown", () => {
    const raw = JSON.stringify({ component: "rocket", data: {} });
    const { ok, spec } = parseComponentSpec(raw);
    expect(ok).toBe(false);
    expect(spec.component).toBe("chat");
  });

  it("falls back when multiselect is missing options", () => {
    const raw = JSON.stringify({
      component: "multiselect",
      data: { question: "Pick" },
    });
    const { ok, spec } = parseComponentSpec(raw);
    expect(ok).toBe(false);
    expect(spec).toEqual(SAFE_FALLBACK_COMPONENT);
  });

  it("falls back when multiselect maxSelections is not a number", () => {
    const raw = JSON.stringify({
      component: "multiselect",
      data: {
        question: "Pick",
        options: [{ id: "a", label: "A", description: "" }],
        maxSelections: "three",
      },
    });
    const { ok } = parseComponentSpec(raw);
    expect(ok).toBe(false);
  });

  it("falls back when yesno statements is a string", () => {
    const raw = JSON.stringify({
      component: "yesno",
      data: { statements: "I support housing" },
    });
    const { ok } = parseComponentSpec(raw);
    expect(ok).toBe(false);
  });

  it("falls back when freetext is missing prompt", () => {
    const raw = JSON.stringify({
      component: "freetext",
      data: { placeholder: "Type here" },
    });
    const { ok } = parseComponentSpec(raw);
    expect(ok).toBe(false);
  });

  it("SAFE_FALLBACK_COMPONENT itself validates against schema", () => {
    const result = ComponentSpecSchema.safeParse(SAFE_FALLBACK_COMPONENT);
    expect(result.success).toBe(true);
  });
});

describe("parseQuestionResponse", () => {
  it("accepts a valid question response", () => {
    const raw = JSON.stringify({
      question: "Which topic matters most to you?",
      type: "chat",
      context: "topic discovery",
    });
    expect(parseQuestionResponse(raw)).toMatchObject({
      question: "Which topic matters most to you?",
      type: "chat",
    });
  });

  it("returns null on invalid JSON", () => {
    expect(parseQuestionResponse("???")).toBeNull();
  });

  it("returns null when question is missing", () => {
    expect(parseQuestionResponse(JSON.stringify({ type: "chat" }))).toBeNull();
  });
});
