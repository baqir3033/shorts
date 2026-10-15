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

  it("applies vivid look and 1.5x speed", () => {
    const spec = defaultEditSpec(60_000, { x: 0, y: 0, w: 1, h: 1 });
    spec.look = {
      preset: "vivid",
      brightness: 0.05,
      contrast: 1.2,
      saturation: 1.35,
      temperature: 0.05,
      vignette: 0.15,
      sharpen: 0.35,
    };
    spec.source.playbackRate = 1.5;
    const g = buildFilterGraph(spec, {
      upright: { w: 1080, h: 1920 },
      hasSourceAudio: true,
    });
    expect(g.filterComplex).toContain("eq=");
    expect(g.filterComplex).toContain("setpts=");
    expect(g.outputDurationSec).toBeCloseTo(20, 0);
  });

  it("applies flip and fade", () => {
    const spec = defaultEditSpec(30_000, { x: 0, y: 0, w: 1, h: 1 });
    spec.source.flipX = true;
    spec.source.fadeInMs = 250;
    const g = buildFilterGraph(spec, {
      upright: { w: 1080, h: 1920 },
      hasSourceAudio: true,
    });
    expect(g.filterComplex).toContain("hflip");
    expect(g.filterComplex).toContain("fade=t=in");
  });

  it("jump cuts concat segments when silence known", () => {
    const spec = defaultEditSpec(10_000, { x: 0, y: 0, w: 1, h: 1 });
    spec.source.endMs = 10_000;
    spec.jumpCuts = {
      enabled: true,
      removeSilencesAboveMs: 400,
      transitionMs: 0,
    };
    const g = buildFilterGraph(spec, {
      upright: { w: 1080, h: 1920 },
      hasSourceAudio: true,
      silenceRanges: [{ startMs: 3_000, endMs: 5_000 }],
    });
    expect(g.filterComplex).toContain("concat=");
  });

  it("burns text overlay drawtext", () => {
    const spec = defaultEditSpec(30_000, { x: 0, y: 0, w: 1, h: 1 });
    spec.textOverlays = [
      {
        id: "t1",
        text: "HOOK",
        startMs: 0,
        endMs: 2000,
        positionNorm: { x: 0.5, y: 0.2 },
        fontSize: 64,
        fontFamily: "bold",
        color: "#ffffff",
        animation: "none",
      },
    ];
    const g = buildFilterGraph(spec, {
      upright: { w: 1080, h: 1920 },
    });
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).toContain("HOOK");
  });
});
