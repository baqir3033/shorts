import { describe, expect, it } from "vitest";
import {
  atempoChain,
  buildRatePieces,
  outputDurationMs,
  sourceToOutputMs,
} from "./timeMap";

describe("timeMap", () => {
  it("uniform rate doubles output duration when rate is 0.5", () => {
    const pieces = buildRatePieces(0, 10_000, 0.5, []);
    expect(outputDurationMs(pieces)).toBeCloseTo(20_000, 0);
  });

  it("segments override global rate", () => {
    const pieces = buildRatePieces(0, 10_000, 1, [
      { startMs: 0, endMs: 5_000, rate: 2 },
    ]);
    // 5s at 2x = 2.5s out + 5s at 1x = 7.5s
    expect(outputDurationMs(pieces)).toBeCloseTo(7_500, 0);
    expect(sourceToOutputMs(5_000, pieces)).toBeCloseTo(2_500, 0);
  });

  it("atempoChain splits rates outside 0.5..2", () => {
    expect(atempoChain(4)).toContain("atempo=2.0");
    expect(atempoChain(1)).toBe("anull");
  });
});
