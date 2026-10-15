import { describe, expect, it } from "vitest";
import { defaultEditSpec } from "@/media/edit-spec/schema";
import { buildFilterGraph, normalizeGraph } from "./buildFilterGraph";

describe("buildFilterGraph", () => {
  it("builds pip graph with overlay", () => {
    const spec = defaultEditSpec(60_000, { x: 0.2, y: 0, w: 0.45, h: 1 });
    spec.reaction = {
      kind: "video",
      offsetMs: 0,
      audio: { sourceGain: 1, reactionGain: 0.8, ducking: true },
    };
    spec.layout = {
      type: "pip",
      anchor: "tr",
      sizePercent: 10,
      marginPx: 24,
      fit: "cover",
    };
    const g = buildFilterGraph(spec, {
      upright: { w: 1920, h: 1080 },
      hasReactionVideo: true,
      hasSourceAudio: true,
    });
    expect(g.filterComplex).toContain("overlay=");
    expect(g.filterComplex).toContain("crop=");
    expect(normalizeGraph(g.filterComplex)).toContain("overlay");
    expect(g.outputArgs).toContain("libx264");
    expect(g.outputArgs).toContain("+faststart");
  });

  it("builds split_horizontal vstack", () => {
    const spec = defaultEditSpec(30_000, { x: 0, y: 0, w: 1, h: 1 });
    spec.reaction = {
      kind: "video",
      offsetMs: 0,
      audio: { sourceGain: 1, reactionGain: 0.8, ducking: true },
    };
    spec.layout = {
      type: "split_horizontal",
      primaryRatio: 0.5,
      primaryOn: "top",
    };
    const g = buildFilterGraph(spec, {
      upright: { w: 1080, h: 1920 },
      hasReactionVideo: true,
      hasSourceAudio: true,
      hasReactionAudio: true,
    });
    expect(g.filterComplex).toContain("vstack");
    expect(g.audioLabel).toBe("aout");
  });

  it("rejects invalid EditSpec", () => {
    expect(() =>
      buildFilterGraph(
        { version: 2, source: {} },
        { upright: { w: 100, h: 100 } },
      ),
    ).toThrow();
  });
});
