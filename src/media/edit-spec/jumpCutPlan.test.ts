import { describe, expect, it } from "vitest";
import {
  keepRangesFromSilence,
  planJumpCuts,
  silenceFromTranscriptGaps,
} from "./jumpCutPlan";

describe("jumpCutPlan", () => {
  it("keeps speech islands between silences", () => {
    const keep = keepRangesFromSilence(0, 10_000, [
      { startMs: 2_000, endMs: 4_000 },
      { startMs: 7_000, endMs: 8_500 },
    ], 400);
    expect(keep).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 4_000, endMs: 7_000 },
      { startMs: 8_500, endMs: 10_000 },
    ]);
  });

  it("derives silence from transcript gaps", () => {
    const gaps = silenceFromTranscriptGaps(
      0,
      10_000,
      [
        { startMs: 0, endMs: 1_000 },
        { startMs: 3_000, endMs: 4_000 },
      ],
      500,
    );
    expect(gaps.some((g) => g.startMs === 1_000 && g.endMs === 3_000)).toBe(
      true,
    );
  });

  it("reports no silence data when empty", () => {
    const plan = planJumpCuts({
      windowStartMs: 0,
      windowEndMs: 5_000,
      removeSilencesAboveMs: 400,
    });
    expect(plan.hasSilenceData).toBe(false);
  });
});
