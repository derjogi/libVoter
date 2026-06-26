import { describe, expect, it } from "vitest";
import { parseModelString } from "@/lib/server/ai/config";

describe("parseModelString", () => {
  it("routes openrouter-prefixed known-provider ids through OpenRouter", () => {
    expect(parseModelString("openrouter/google/gemma-4-31b-it:free")).toEqual({
      provider: "openrouter",
      model: "google/gemma-4-31b-it:free",
    });
    expect(parseModelString("openrouter/openai/gpt-oss-20b:free")).toEqual({
      provider: "openrouter",
      model: "openai/gpt-oss-20b:free",
    });
  });

  it("preserves full OpenRouter model ids that contain provider/model slashes", () => {
    expect(parseModelString("openrouter/nex-agi/nex-n2-pro:free")).toEqual({
      provider: "openrouter",
      model: "nex-agi/nex-n2-pro:free",
    });
  });

  it("treats bare OpenRouter model ids as OpenRouter models", () => {
    expect(parseModelString("nex-agi/nex-n2-pro:free")).toEqual({
      provider: "openrouter",
      model: "nex-agi/nex-n2-pro:free",
    });
  });

  it("preserves OpenRouter's own model namespace such as openrouter/free", () => {
    expect(parseModelString("openrouter/free")).toEqual({
      provider: "openrouter",
      model: "openrouter/free",
    });
  });
});
