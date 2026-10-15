import { describe, expect, it } from "vitest";
import { detectSilenceFromPcm } from "./detectSilence";

describe("detectSilenceFromPcm", () => {
  it("flags a quiet middle region", () => {
    const sr = 16_000;
    const totalSec = 3;
    const pcm = new Float32Array(sr * totalSec);
    // loud - quiet - loud
    for (let i = 0; i < sr; i++) pcm[i] = 0.2;
    for (let i = sr; i < 2 * sr; i++) pcm[i] = 0.001;
    for (let i = 2 * sr; i < pcm.length; i++) pcm[i] = 0.2;

    const silences = detectSilenceFromPcm(pcm, {
      sampleRate: sr,
      minSilenceMs: 400,
      rmsThreshold: 0.02,
    });
    expect(silences.length).toBeGreaterThanOrEqual(1);
    expect(silences[0].startMs).toBeGreaterThanOrEqual(800);
    expect(silences[0].endMs).toBeLessThanOrEqual(2200);
  });
});
