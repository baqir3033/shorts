import { describe, expect, it } from "vitest";
import {
  pipRect,
  splitHorizontalRects,
  splitVerticalRects,
  suggestCrop9x16,
  uprightSize,
} from "./layoutMath";

describe("layoutMath", () => {
  it("uprightSize swaps on 90° rotation", () => {
    expect(uprightSize({ width: 1920, height: 1080, rotation: 90 })).toEqual({
      w: 1080,
      h: 1920,
    });
  });

  it("split_vertical 50/50 sums to output width", () => {
    const { primary, secondary } = splitVerticalRects(
      { w: 1080, h: 1920 },
      0.5,
    );
    expect(primary.w + secondary.w).toBe(1080);
    expect(primary.w).toBe(540);
    expect(secondary.w).toBe(540);
  });

  it("split_vertical 40/60 remainder goes to secondary", () => {
    const { primary, secondary } = splitVerticalRects(
      { w: 1080, h: 1920 },
      0.4,
    );
    expect(primary.w).toBe(432);
    expect(secondary.w).toBe(648);
    expect(primary.w + secondary.w).toBe(1080);
  });

  it("split_horizontal 50/50 and 70/30", () => {
    const half = splitHorizontalRects({ w: 1080, h: 1920 }, 0.5, "top");
    expect(half.primary.h).toBe(960);
    expect(half.secondary.h).toBe(960);

    const heavy = splitHorizontalRects({ w: 1080, h: 1920 }, 0.7, "top");
    expect(heavy.primary.h).toBe(1344);
    expect(heavy.secondary.h).toBe(576);
    expect(heavy.primary.h + heavy.secondary.h).toBe(1920);
  });

  it("pip TR 10% stays on canvas", () => {
    const r = pipRect({ w: 1080, h: 1920 }, "tr", 10, 24);
    expect(r.h).toBe(192);
    expect(r.x + r.w).toBeLessThanOrEqual(1080);
    expect(r.y).toBe(24);
  });

  it("pip size clamps to 8–35", () => {
    const small = pipRect({ w: 1080, h: 1920 }, "br", 1, 0);
    const large = pipRect({ w: 1080, h: 1920 }, "br", 90, 0);
    expect(small.h).toBe(Math.round((1920 * 8) / 100));
    expect(large.h).toBe(Math.round((1920 * 35) / 100));
  });

  it("suggestCrop9x16 with no face is centered", () => {
    const upright = { w: 1920, h: 1080 };
    const crop = suggestCrop9x16(upright, null);
    const pixelAR = (crop.w * upright.w) / (crop.h * upright.h);
    expect(pixelAR).toBeCloseTo(9 / 16, 2);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1.001);
  });
});
