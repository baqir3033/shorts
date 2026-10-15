import { describe, expect, it } from "vitest";
import { buildCaptionBurn } from "./captionBurn";

describe("buildCaptionBurn", () => {
  it("emits timed drawtext for karaoke styles", () => {
    const words = [
      { text: "Wait", startMs: 0, endMs: 300, emphasis: true },
      { text: "nobody", startMs: 320, endMs: 600 },
      { text: "talks", startMs: 620, endMs: 900 },
    ];
    for (const styleId of [
      "bold-white-outline",
      "bold-yellow-black",
      "word-by-word-pop",
    ] as const) {
      const burn = buildCaptionBurn(words, styleId, "vout");
      expect(burn.chain).toContain("drawtext=");
      expect(burn.chain).toContain("fontfile=caption.ttf");
      expect(burn.chain).toContain("enable=");
      expect(burn.outLabel).not.toBe("vout");
    }
  });
});
