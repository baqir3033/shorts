import { describe, expect, it } from "vitest";
import {
  keepRangesFromSilence,
  planJumpCuts,
  planSilenceRefill,
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

  it("reports no speech timeline when empty", () => {
    const plan = planJumpCuts({
      windowStartMs: 0,
      windowEndMs: 5_000,
      removeSilencesAboveMs: 400,
    });
    expect(plan.hasSpeechTimeline).toBe(false);
    expect(plan.hasSilenceData).toBe(false);
  });

  it("has speech timeline when transcript exists even without large gaps", () => {
    const plan = planJumpCuts({
      windowStartMs: 0,
      windowEndMs: 5_000,
      removeSilencesAboveMs: 2000,
      transcriptItems: [
        { startMs: 0, endMs: 2_000 },
        { startMs: 2_100, endMs: 4_000 },
      ],
    });
    expect(plan.hasSpeechTimeline).toBe(true);
    expect(plan.hasSilenceData).toBe(true);
  });

  it("refills to target length after cutting silence", () => {
    // 0-10s speech, 10-15s silence, 15-40s speech — start at 0, target 30s
    const refill = planSilenceRefill({
      anchorStartMs: 0,
      targetLengthMs: 30_000,
      durationMs: 40_000,
      silenceRanges: [{ startMs: 10_000, endMs: 15_000 }],
      removeSilencesAboveMs: 400,
    });
    expect(refill.keptMs).toBeGreaterThanOrEqual(29_000);
    expect(refill.metTarget).toBe(true);
    expect(refill.keep.length).toBeGreaterThanOrEqual(2);
    // harvest spans past the silence into later speech
    expect(refill.harvestEndMs).toBeGreaterThan(15_000);
  });
});
