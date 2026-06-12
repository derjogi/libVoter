import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComponentDataSchema,
  ComponentSpecSchema,
  parseComponentSpec,
  parseQuestionResponse,
  parseRAGResponse,
  SAFE_FALLBACK_COMPONENT,
} from "@/types/components.zod";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parseComponentSpec", () => {
  it("accepts a valid multiselect spec", () => {
    const raw = JSON.stringify({
      type: "multiselect",
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
    expect(spec.type).toBe("multiselect");
    if (spec.type === "multiselect") {
      expect(spec.data.options).toHaveLength(2);
    }
  });

  it("accepts a valid yesno spec", () => {
    const raw = JSON.stringify({
      type: "yesno",
      data: {
        statements: [
          { statement: "I support more public transport investment." },
          { statement: "Property taxes should be lowered.", context: "fiscal" },
        ],
      },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
    expect(spec.type).toBe("yesno");
  });

  it("accepts a valid slider spec", () => {
    const raw = JSON.stringify({
      type: "slider",
      data: { label: "How much?", min: 0, max: 10 },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
  });

  it("accepts a valid priority spec", () => {
    const raw = JSON.stringify({
      type: "priority",
      reasoning: "rank issues by importance",
      data: {
        question: "Rank these issues by importance to you:",
        options: [
          {
            id: "housing",
            label: "Housing",
            description: "Affordable housing",
          },
          {
            id: "transport",
            label: "Transport",
            description: "Public transport",
          },
          { id: "climate", label: "Climate", description: "Climate action" },
        ],
      },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
    expect(spec.type).toBe("priority");
    if (spec.type === "priority") {
      expect(spec.data.options).toHaveLength(3);
    }
  });

  it("falls back when priority has fewer than 2 options", () => {
    const raw = JSON.stringify({
      type: "priority",
      data: {
        question: "Rank this",
        options: [{ id: "only", label: "Only option" }],
      },
    });
    const { ok } = parseComponentSpec(raw);
    expect(ok).toBe(false);
  });

  it("falls back when JSON is invalid", () => {
    const { spec, ok, error } = parseComponentSpec("not json {{{");
    expect(ok).toBe(false);
    expect(error).toMatch(/JSON/i);
    expect(spec).toEqual(SAFE_FALLBACK_COMPONENT);
  });

  it("falls back when component name is unknown", () => {
    const raw = JSON.stringify({ type: "rocket", data: {} });
    const { ok, spec } = parseComponentSpec(raw);
    expect(ok).toBe(false);
    expect(spec.type).toBe("chat");
  });

  it("falls back when multiselect is missing options", () => {
    const raw = JSON.stringify({
      type: "multiselect",
      data: { question: "Pick" },
    });
    const { ok, spec } = parseComponentSpec(raw);
    expect(ok).toBe(false);
    expect(spec).toEqual(SAFE_FALLBACK_COMPONENT);
  });

  it("falls back when multiselect maxSelections is not a number", () => {
    const raw = JSON.stringify({
      type: "multiselect",
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
      type: "yesno",
      data: { statements: "I support housing" },
    });
    const { ok } = parseComponentSpec(raw);
    expect(ok).toBe(false);
  });

  it("falls back when freetext is missing prompt", () => {
    const raw = JSON.stringify({
      type: "freetext",
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

describe("parseRAGResponse", () => {
  it("accepts a fully-shaped response", () => {
    const raw = JSON.stringify({
      candidates: [{ id: "c1" }],
      policies: [
        { topic: "Housing", stance: "supports", details: "more density" },
      ],
      sources: ["https://example.com"],
    });
    const out = parseRAGResponse(raw);
    expect(out?.policies).toHaveLength(1);
    expect(out?.sources).toEqual(["https://example.com"]);
  });

  it("accepts an empty object (all fields default to [])", () => {
    const out = parseRAGResponse("{}");
    expect(out).toEqual({ candidates: [], policies: [], sources: [] });
  });

  it("returns null on invalid JSON", () => {
    expect(parseRAGResponse("not json")).toBeNull();
  });

  it("returns null when policy entry is malformed", () => {
    const raw = JSON.stringify({
      policies: [{ topic: "Housing" }], // missing required `stance`
    });
    expect(parseRAGResponse(raw)).toBeNull();
  });
});

describe("ComponentDataSchema narrowing", () => {
  it("back-compat: rewrites legacy `component` key to `type`", () => {
    const raw = JSON.stringify({
      component: "freetext",
      data: { prompt: "Why?", placeholder: "Tell me" },
    });
    const { spec, ok } = parseComponentSpec(raw);
    expect(ok).toBe(true);
    expect(spec.type).toBe("freetext");
  });

  it("ComponentDataSchema is the same instance the runtime uses", () => {
    expect(ComponentDataSchema).toBe(ComponentSpecSchema);
  });
});
