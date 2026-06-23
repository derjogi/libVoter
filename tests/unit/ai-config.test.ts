import { describe, expect, it } from "vitest";
import { parseModelString } from "@/lib/server/ai/config";

describe("parseModelString", () => {
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
});
