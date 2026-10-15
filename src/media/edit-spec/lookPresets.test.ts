import { describe, expect, it } from "vitest";
import {
  clampLook,
  isIdentityLook,
  lookFromPreset,
  lookToFfmpegFilters,
} from "./lookPresets";

describe("lookPresets", () => {
  it("vivid sets punchy defaults", () => {
    const l = lookFromPreset("vivid");
    expect(l.saturation).toBeGreaterThan(1);
    expect(isIdentityLook(l)).toBe(false);
  });

  it("clampLook bounds knobs", () => {
    const l = clampLook({
      preset: "none",
      brightness: 9,
      contrast: 0.1,
      saturation: 5,
      temperature: -3,
      vignette: 2,
      sharpen: -1,
    });
    expect(l.brightness).toBe(1);
    expect(l.contrast).toBe(0.5);
    expect(l.saturation).toBe(2);
    expect(l.temperature).toBe(-1);
    expect(l.vignette).toBe(1);
    expect(l.sharpen).toBe(0);
  });

  it("lookToFfmpegFilters emits eq for vivid", () => {
    const filters = lookToFfmpegFilters(lookFromPreset("vivid"));
    expect(filters.some((f) => f.startsWith("eq="))).toBe(true);
  });

  it("identity look emits no filters", () => {
    expect(lookToFfmpegFilters(lookFromPreset("none"))).toEqual([]);
  });
});
