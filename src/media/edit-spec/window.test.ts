import { describe, expect, it } from "vitest";
import {
  clampWindow,
  jumpWindowToMs,
  moveWindow,
  resolveLengthMs,
  windowFromLength,
} from "./window";

describe("locked window helpers", () => {
  it("resolveLengthMs clamps to duration", () => {
    expect(resolveLengthMs(30_000, 120_000)).toBe(30_000);
    expect(resolveLengthMs(60_000, 40_000)).toBe(40_000);
    expect(resolveLengthMs(30_000, 0)).toBe(0);
  });

  it("windowFromLength starts at 0 with locked L", () => {
    expect(windowFromLength(30_000, 120_000)).toEqual({
      startMs: 0,
      endMs: 30_000,
      lengthMs: 30_000,
    });
  });

  it("clampWindow keeps end - start === L and respects max start", () => {
    expect(clampWindow(100_000, 30_000, 120_000)).toEqual({
      startMs: 90_000,
      endMs: 120_000,
      lengthMs: 30_000,
    });
    expect(clampWindow(-5_000, 30_000, 120_000)).toEqual({
      startMs: 0,
      endMs: 30_000,
      lengthMs: 30_000,
    });
  });

  it("moveWindow slides without changing length", () => {
    const moved = moveWindow(10_000, 5_000, 30_000, 120_000);
    expect(moved).toEqual({
      startMs: 15_000,
      endMs: 45_000,
      lengthMs: 30_000,
    });
    expect(moved.endMs - moved.startMs).toBe(30_000);
  });

  it("jumpWindowToMs centers then clamps", () => {
    expect(jumpWindowToMs(60_000, 30_000, 120_000)).toEqual({
      startMs: 45_000,
      endMs: 75_000,
      lengthMs: 30_000,
    });
    expect(jumpWindowToMs(5_000, 30_000, 120_000)).toEqual({
      startMs: 0,
      endMs: 30_000,
      lengthMs: 30_000,
    });
  });

  it("short source uses full file as L", () => {
    expect(clampWindow(0, 30_000, 12_000)).toEqual({
      startMs: 0,
      endMs: 12_000,
      lengthMs: 12_000,
    });
  });
});
