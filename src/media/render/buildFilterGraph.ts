import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/lib/constants";
import { parseEditSpec } from "@/media/edit-spec/schema";
import { buildCaptionBurn, CAPTION_FONT_MEMFS } from "./captionBurn";
import {
  cropNormToPixels,
  layoutPanes,
  type Size,
} from "./layoutMath";

export type FilterGraphResult = {
  filterComplex: string;
  videoLabel: string;
  audioLabel: string | null;
  outputArgs: string[];
};

/**
 * Pure dumb translator: EditSpec → ffmpeg filter_complex.
 * No AI. No heuristics beyond layout math.
 */
export function buildFilterGraph(
  rawSpec: unknown,
  opts?: {
    hasReactionVideo?: boolean;
    hasReactionImage?: boolean;
    hasSourceAudio?: boolean;
    hasReactionAudio?: boolean;
    upright: Size;
    sourceRotation?: 0 | 90 | 180 | 270;
  },
): FilterGraphResult {
  const spec = parseEditSpec(rawSpec);
  const upright = opts?.upright ?? {
    w: OUTPUT_WIDTH,
    h: OUTPUT_HEIGHT,
  };
  const crop = cropNormToPixels(spec.source.cropNorm, upright);
  const outW = spec.output.width || OUTPUT_WIDTH;
  const outH = spec.output.height || OUTPUT_HEIGHT;
  const fps = spec.output.fps || OUTPUT_FPS;
  const panes = layoutPanes(spec.layout, { w: outW, h: outH });

  const startSec = (spec.source.startMs / 1000).toFixed(3);
  const endSec = (spec.source.endMs / 1000).toFixed(3);
  const duration = ((spec.source.endMs - spec.source.startMs) / 1000).toFixed(3);

  const rotateFilter = rotationFilter(opts?.sourceRotation ?? 0);
  const chains: string[] = [];

  // Source trim + rotate + crop
  const srcChain = [
    `[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS`,
    rotateFilter,
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`,
  ]
    .filter(Boolean)
    .join(",");

  const hasReaction =
    (opts?.hasReactionVideo || opts?.hasReactionImage) &&
    spec.reaction?.kind !== "none" &&
    spec.reaction?.kind !== undefined;

  // Primary product path: full-frame crop (source-only) or PiP overlay
  if (spec.layout.type === "pip" || !hasReaction) {
    const overlay = panes.overlay;
    const fill = spec.source.backgroundFill ?? "none";

    if (!hasReaction) {
      // Trim, crop, scale to 9:16 + light sharpen to counter scale softness
      chains.push(
        `${srcChain},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},unsharp=5:5:0.6:5:5:0.0,fps=${fps},format=yuv420p[vout]`,
      );
    } else if (fill === "blur") {
      chains.push(
        `[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS${rotateFilter ? `,${rotateFilter}` : ""},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=30:2[bg]`,
      );
      chains.push(
        `${srcChain},scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2[fg]`,
      );
      chains.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[base]`);
      const fit = spec.layout.type === "pip" ? (spec.layout.fit ?? "cover") : "cover";
      const ov = overlay ?? { x: outW - 200, y: 24, w: 108, h: 192 };
      const scaleExpr =
        fit === "contain"
          ? `scale=${ov.w}:${ov.h}:force_original_aspect_ratio=decrease,pad=${ov.w}:${ov.h}:(ow-iw)/2:(oh-ih)/2`
          : `scale=${ov.w}:${ov.h}:force_original_aspect_ratio=increase,crop=${ov.w}:${ov.h}`;
      chains.push(`[1:v]${scaleExpr},fps=${fps},format=yuv420p[pip]`);
      chains.push(`[base][pip]overlay=${ov.x}:${ov.y}:format=auto[vout]`);
    } else {
      chains.push(
        `${srcChain},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},fps=${fps},format=yuv420p[base]`,
      );
      const fit = spec.layout.type === "pip" ? (spec.layout.fit ?? "cover") : "cover";
      const ov = overlay ?? { x: outW - 200, y: 24, w: 108, h: 192 };
      const scaleExpr =
        fit === "contain"
          ? `scale=${ov.w}:${ov.h}:force_original_aspect_ratio=decrease,pad=${ov.w}:${ov.h}:(ow-iw)/2:(oh-ih)/2`
          : `scale=${ov.w}:${ov.h}:force_original_aspect_ratio=increase,crop=${ov.w}:${ov.h}`;
      chains.push(`[1:v]${scaleExpr},fps=${fps},format=yuv420p[pip]`);
      chains.push(
        `[base][pip]overlay=${ov.x}:${ov.y}:format=auto[vout]`,
      );
    }
  } else if (spec.layout.type === "split_vertical") {
    const p = panes.primary!;
    const s = panes.secondary!;
    chains.push(
      `${srcChain},scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h},fps=${fps},format=yuv420p[left]`,
    );
    if (hasReaction) {
      chains.push(
        `[1:v]scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h},fps=${fps},format=yuv420p[right]`,
      );
      chains.push(`[left][right]hstack=inputs=2[vout]`);
    } else {
      chains.push(
        `[left]pad=${outW}:${outH}:0:0:black[vout]`,
      );
    }
  } else {
    // split_horizontal
    const p = panes.primary!;
    const s = panes.secondary!;
    chains.push(
      `${srcChain},scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h},fps=${fps},format=yuv420p[pri]`,
    );
    if (hasReaction) {
      chains.push(
        `[1:v]scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h},fps=${fps},format=yuv420p[sec]`,
      );
      if (spec.layout.primaryOn === "top") {
        chains.push(`[pri][sec]vstack=inputs=2[vout]`);
      } else {
        chains.push(`[sec][pri]vstack=inputs=2[vout]`);
      }
    } else {
      chains.push(`[pri]pad=${outW}:${outH}:0:0:black[vout]`);
    }
  }

  // Karaoke caption burn-in (per-word timed drawtext)
  let videoLabel = "vout";
  if (spec.captions?.enabled && spec.captions.words.length > 0) {
    const burn = buildCaptionBurn(
      spec.captions.words,
      spec.captions.styleId ?? "bold-white-outline",
      "vout",
      CAPTION_FONT_MEMFS,
    );
    if (burn.chain) {
      chains.push(burn.chain);
      videoLabel = burn.outLabel;
    }
  }

  // Audio — light denoise + loudnorm to -14 LUFS (short-form standard)
  let audioLabel: string | null = null;
  const audioChains: string[] = [];
  const srcGain = spec.reaction?.audio.sourceGain ?? 1;
  const rxGain = spec.reaction?.audio.reactionGain ?? 0.8;
  const offsetMs = spec.reaction?.offsetMs ?? 0;
  const audioPolish = `highpass=f=70,afftdn=nr=6:nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11`;

  if (opts?.hasSourceAudio) {
    audioChains.push(
      `[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,${audioPolish},volume=${srcGain}[a0]`,
    );
  }
  if (hasReaction && opts?.hasReactionAudio && opts.hasReactionVideo) {
    const delay = Math.max(0, offsetMs);
    audioChains.push(
      `[1:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${rxGain}[a1]`,
    );
  }

  if (audioChains.length === 2) {
    chains.push(...audioChains);
    chains.push(
      `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    );
    audioLabel = "aout";
  } else if (audioChains.length === 1) {
    chains.push(...audioChains);
    audioLabel = "a0";
  }

  const filterComplex = chains.join(";");
  const bitrate = spec.output.videoBitrate || "8M";

  const outputArgs = [
    "-map",
    `[${videoLabel}]`,
    ...(audioLabel ? ["-map", `[${audioLabel}]`] : ["-an"]),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-b:v",
    bitrate,
    "-maxrate",
    "10M",
    "-bufsize",
    "16M",
    ...(audioLabel ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-movflags",
    "+faststart",
    "-t",
    duration,
  ];

  return { filterComplex, videoLabel, audioLabel, outputArgs };
}

function rotationFilter(rotation: 0 | 90 | 180 | 270): string {
  if (rotation === 90) return "transpose=1";
  if (rotation === 180) return "transpose=1,transpose=1";
  if (rotation === 270) return "transpose=2";
  return "";
}

/** Stable snapshot helper for golden tests — strips whitespace variance. */
export function normalizeGraph(graph: string): string {
  return graph.replace(/\s+/g, "");
}
