import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/lib/constants";
import { parseEditSpec } from "@/media/edit-spec/schema";
import { normalizeEffects } from "@/media/edit-spec/normalizeEffects";
import { lookToFfmpegFilters } from "@/media/edit-spec/lookPresets";
import { planJumpCuts, type TimeRange } from "@/media/edit-spec/jumpCutPlan";
import {
  atempoChain,
  buildRatePieces,
  outputDurationMs,
  sourceToOutputMs,
  type RatePiece,
} from "@/media/edit-spec/timeMap";
import type { EditSpec, TimedWord } from "@/media/edit-spec/types";
import { buildCaptionBurn, CAPTION_FONT_MEMFS } from "./captionBurn";
import { buildTextOverlayBurn } from "./textOverlayBurn";
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
  /** Output duration in seconds after speed/jump-cuts */
  outputDurationSec: number;
  degradations: string[];
};

export type BuildFilterGraphOpts = {
  hasReactionVideo?: boolean;
  hasReactionImage?: boolean;
  hasSourceAudio?: boolean;
  hasReactionAudio?: boolean;
  upright: Size;
  sourceRotation?: 0 | 90 | 180 | 270;
  silenceRanges?: TimeRange[];
  transcriptItems?: { startMs: number; endMs: number }[];
};

/**
 * Pure dumb translator: EditSpec → ffmpeg filter_complex.
 */
export function buildFilterGraph(
  rawSpec: unknown,
  opts?: BuildFilterGraphOpts,
): FilterGraphResult {
  const parsed = parseEditSpec(rawSpec);
  const spec = normalizeEffects(parsed as EditSpec);
  const degradations: string[] = [];
  const upright = opts?.upright ?? {
    w: OUTPUT_WIDTH,
    h: OUTPUT_HEIGHT,
  };
  const crop = cropNormToPixels(spec.source.cropNorm, upright);
  const outW = spec.output.width || OUTPUT_WIDTH;
  const outH = spec.output.height || OUTPUT_HEIGHT;
  const fps = spec.output.fps || OUTPUT_FPS;
  const panes = layoutPanes(spec.layout, { w: outW, h: outH });

  const winStart = spec.source.startMs;
  const winEnd = spec.source.endMs;
  const probeRotate = rotationFilter(opts?.sourceRotation ?? 0);
  const editorRotate = editorRotationFilter(
    spec.source.rotateQuarterTurns ?? 0,
  );
  const flips = [
    spec.source.flipX ? "hflip" : "",
    spec.source.flipY ? "vflip" : "",
  ]
    .filter(Boolean)
    .join(",");

  const jumpEnabled = !!spec.jumpCuts?.enabled;
  const jumpPlan = jumpEnabled
    ? planJumpCuts({
        windowStartMs: winStart,
        windowEndMs: winEnd,
        removeSilencesAboveMs: spec.jumpCuts!.removeSilencesAboveMs,
        silenceRanges: opts?.silenceRanges,
        transcriptItems: opts?.transcriptItems,
      })
    : null;

  if (jumpEnabled && jumpPlan && !jumpPlan.hasSilenceData) {
    degradations.push("jumpcut_no_silence");
  }

  const keepRanges: TimeRange[] =
    jumpEnabled && jumpPlan?.hasSilenceData
      ? jumpPlan.keep
      : [{ startMs: winStart, endMs: winEnd }];

  const globalRate = spec.source.playbackRate ?? 1;
  // When jump-cutting, apply global rate only (segments ignored for encode simplicity)
  const ratePieces: RatePiece[] =
    keepRanges.length > 1
      ? buildRatePieces(winStart, winEnd, globalRate, null)
      : buildRatePieces(
          winStart,
          winEnd,
          globalRate,
          spec.source.speedSegments,
        );

  // Effective pieces constrained to keep ranges for duration calc
  const durationPieces = expandPiecesOverKeeps(keepRanges, ratePieces);
  const outDurMs = outputDurationMs(durationPieces);
  const outDurSec = Math.max(0.1, outDurMs / 1000);

  const lookFilters = lookToFfmpegFilters(spec.look);
  const lookPart = lookFilters.length ? `,${lookFilters.join(",")}` : "";

  const fadeIn = Math.min(
    (spec.source.fadeInMs ?? 0) / 1000,
    outDurSec / 2,
  );
  const fadeOut = Math.min(
    (spec.source.fadeOutMs ?? 0) / 1000,
    outDurSec / 2,
  );
  const fadeParts: string[] = [];
  if (fadeIn > 0.01) fadeParts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0.01) {
    const st = Math.max(0, outDurSec - fadeOut);
    fadeParts.push(`fade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }
  const fadePart = fadeParts.length ? `,${fadeParts.join(",")}` : "";

  const chains: string[] = [];
  const hasReaction =
    (opts?.hasReactionVideo || opts?.hasReactionImage) &&
    spec.reaction?.kind !== "none" &&
    spec.reaction?.kind !== undefined;

  // --- Build primary [basev] ---
  const transitionMs = spec.jumpCuts?.transitionMs ?? 0;
  const transitionType =
    spec.transitions?.[0]?.type === "fade_black"
      ? "fade_black"
      : transitionMs > 0 && keepRanges.length > 1
        ? "dissolve"
        : "none";

  if (keepRanges.length === 1 && durationPieces.length === 1) {
    const rate = durationPieces[0].rate;
    const startSec = (keepRanges[0].startMs / 1000).toFixed(3);
    const endSec = (keepRanges[0].endMs / 1000).toFixed(3);
    const setpts =
      Math.abs(rate - 1) < 0.001
        ? "setpts=PTS-STARTPTS"
        : `setpts=(PTS-STARTPTS)/${rate.toFixed(4)}`;
    const xform = [probeRotate, editorRotate, flips].filter(Boolean).join(",");
    const head = [`[0:v]trim=start=${startSec}:end=${endSec}`, setpts, xform]
      .filter(Boolean)
      .join(",");
    chains.push(
      `${head},crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},unsharp=5:5:0.6:5:5:0.0${lookPart}${fadePart},fps=${fps},format=yuv420p[basev]`,
    );
  } else {
    // Multi-piece: trim each, scale, retime, concat (hard cut). xfade best-effort.
    const labels: string[] = [];
    durationPieces.forEach((p, i) => {
      const startSec = (p.startMs / 1000).toFixed(3);
      const endSec = (p.endMs / 1000).toFixed(3);
      const setpts =
        Math.abs(p.rate - 1) < 0.001
          ? "setpts=PTS-STARTPTS"
          : `setpts=(PTS-STARTPTS)/${p.rate.toFixed(4)}`;
      const xform = [probeRotate, editorRotate, flips]
        .filter(Boolean)
        .join(",");
      const head = [`[0:v]trim=start=${startSec}:end=${endSec}`, setpts, xform]
        .filter(Boolean)
        .join(",");
      const lab = `segv${i}`;
      chains.push(
        `${head},crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},fps=${fps},format=yuv420p[${lab}]`,
      );
      labels.push(lab);
    });

    if (
      labels.length > 1 &&
      transitionType !== "none" &&
      transitionMs >= 40
    ) {
      // Sequential xfade — may fail on some wasm builds; encode can degrade
      let prev = labels[0];
      let accDur = (durationPieces[0].endMs - durationPieces[0].startMs) /
        durationPieces[0].rate /
        1000;
      const td = (transitionMs / 1000).toFixed(3);
      const transition =
        transitionType === "fade_black" ? "fadeblack" : "fade";
      for (let i = 1; i < labels.length; i++) {
        const out = i === labels.length - 1 ? "xfout" : `xf${i}`;
        const offset = Math.max(0, accDur - transitionMs / 1000);
        chains.push(
          `[${prev}][${labels[i]}]xfade=transition=${transition}:duration=${td}:offset=${offset.toFixed(3)}[${out}]`,
        );
        prev = out;
        accDur +=
          (durationPieces[i].endMs - durationPieces[i].startMs) /
            durationPieces[i].rate /
            1000 -
          transitionMs / 1000;
      }
      chains.push(
        `[${prev}]unsharp=5:5:0.6:5:5:0.0${lookPart}${fadePart},format=yuv420p[basev]`,
      );
    } else {
      const n = labels.length;
      const inputs = labels.map((l) => `[${l}]`).join("");
      chains.push(
        `${inputs}concat=n=${n}:v=1:a=0[catv]`,
      );
      chains.push(
        `[catv]unsharp=5:5:0.6:5:5:0.0${lookPart}${fadePart},format=yuv420p[basev]`,
      );
    }
  }

  // PiP / layout on top of basev
  if (hasReaction && spec.layout.type === "pip") {
    const overlay = panes.overlay ?? {
      x: outW - 200,
      y: 24,
      w: 108,
      h: 192,
    };
    const fit = spec.layout.fit ?? "cover";
    const scaleExpr =
      fit === "contain"
        ? `scale=${overlay.w}:${overlay.h}:force_original_aspect_ratio=decrease,pad=${overlay.w}:${overlay.h}:(ow-iw)/2:(oh-ih)/2`
        : `scale=${overlay.w}:${overlay.h}:force_original_aspect_ratio=increase,crop=${overlay.w}:${overlay.h}`;
    chains.push(`[1:v]${scaleExpr},fps=${fps},format=yuv420p[pip]`);
    chains.push(
      `[basev][pip]overlay=${overlay.x}:${overlay.y}:format=auto[vout]`,
    );
  } else if (hasReaction && spec.layout.type === "split_vertical") {
    const p = panes.primary!;
    const s = panes.secondary!;
    chains.push(
      `[basev]scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h}[left]`,
    );
    chains.push(
      `[1:v]scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h},fps=${fps},format=yuv420p[right]`,
    );
    chains.push(`[left][right]hstack=inputs=2[vout]`);
  } else if (hasReaction && spec.layout.type === "split_horizontal") {
    const p = panes.primary!;
    const s = panes.secondary!;
    chains.push(
      `[basev]scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h}[pri]`,
    );
    chains.push(
      `[1:v]scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h},fps=${fps},format=yuv420p[sec]`,
    );
    if (spec.layout.primaryOn === "top") {
      chains.push(`[pri][sec]vstack=inputs=2[vout]`);
    } else {
      chains.push(`[sec][pri]vstack=inputs=2[vout]`);
    }
  } else {
    chains.push(`[basev]null[vout]`);
  }

  // Remap caption/text times: clip-relative source → output
  const mapClipRel = (clipRelMs: number) =>
    sourceToOutputMs(winStart + clipRelMs, durationPieces);

  let videoLabel = "vout";
  if (spec.captions?.enabled && spec.captions.words.length > 0) {
    const remapped = remapWords(spec.captions.words, mapClipRel);
    const burn = buildCaptionBurn(
      remapped,
      spec.captions.styleId ?? "bold-white-outline",
      videoLabel,
      CAPTION_FONT_MEMFS,
    );
    if (burn.chain) {
      chains.push(burn.chain);
      videoLabel = burn.outLabel;
    }
  }

  if (spec.textOverlays?.length) {
    const burn = buildTextOverlayBurn(
      spec.textOverlays,
      videoLabel,
      mapClipRel,
      CAPTION_FONT_MEMFS,
    );
    if (burn.chain) {
      chains.push(burn.chain);
      videoLabel = burn.outLabel;
    }
  }

  // Audio
  let audioLabel: string | null = null;
  const srcGain = spec.source.sourceMuted
    ? 0
    : (spec.reaction?.audio.sourceGain ?? 1);
  const rxGain = spec.reaction?.audio.reactionGain ?? 0.8;
  const offsetMs = spec.reaction?.offsetMs ?? 0;
  const audioPolish = `highpass=f=70,afftdn=nr=6:nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11`;

  if (opts?.hasSourceAudio) {
    if (durationPieces.length === 1) {
      const p = durationPieces[0];
      const startSec = (p.startMs / 1000).toFixed(3);
      const endSec = (p.endMs / 1000).toFixed(3);
      const tempo = atempoChain(p.rate);
      const afade: string[] = [];
      if (fadeIn > 0.01) afade.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
      if (fadeOut > 0.01) {
        const st = Math.max(0, outDurSec - fadeOut);
        afade.push(`afade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
      }
      const afadePart = afade.length ? `,${afade.join(",")}` : "";
      chains.push(
        `[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,${tempo},${audioPolish}${afadePart},volume=${srcGain}[a0]`,
      );
    } else {
      durationPieces.forEach((p, i) => {
        const startSec = (p.startMs / 1000).toFixed(3);
        const endSec = (p.endMs / 1000).toFixed(3);
        const tempo = atempoChain(p.rate);
        chains.push(
          `[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,${tempo}[aseg${i}]`,
        );
      });
      const n = durationPieces.length;
      const inputs = durationPieces.map((_, i) => `[aseg${i}]`).join("");
      chains.push(`${inputs}concat=n=${n}:v=0:a=1[acat]`);
      const afade: string[] = [];
      if (fadeIn > 0.01) afade.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
      if (fadeOut > 0.01) {
        const st = Math.max(0, outDurSec - fadeOut);
        afade.push(`afade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
      }
      const afadePart = afade.length ? `,${afade.join(",")}` : "";
      chains.push(
        `[acat]${audioPolish}${afadePart},volume=${srcGain}[a0]`,
      );
    }
    audioLabel = "a0";
  }

  if (hasReaction && opts?.hasReactionAudio && opts.hasReactionVideo) {
    const delay = Math.max(0, offsetMs);
    chains.push(
      `[1:a]atrim=duration=${outDurSec.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=${rxGain}[a1]`,
    );
    if (audioLabel) {
      chains.push(
        `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
      );
      audioLabel = "aout";
    } else {
      audioLabel = "a1";
    }
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
    outDurSec.toFixed(3),
  ];

  return {
    filterComplex,
    videoLabel,
    audioLabel,
    outputArgs,
    outputDurationSec: outDurSec,
    degradations,
  };
}

function expandPiecesOverKeeps(
  keeps: TimeRange[],
  pieces: RatePiece[],
): RatePiece[] {
  const out: RatePiece[] = [];
  for (const k of keeps) {
    for (const p of pieces) {
      const start = Math.max(k.startMs, p.startMs);
      const end = Math.min(k.endMs, p.endMs);
      if (end > start + 1) {
        out.push({ startMs: start, endMs: end, rate: p.rate });
      }
    }
  }
  return out.length
    ? out
    : [{ startMs: keeps[0].startMs, endMs: keeps[0].endMs, rate: 1 }];
}

function remapWords(
  words: TimedWord[],
  mapClipRel: (ms: number) => number,
): TimedWord[] {
  return words.map((w) => ({
    ...w,
    startMs: mapClipRel(w.startMs),
    endMs: Math.max(mapClipRel(w.startMs) + 40, mapClipRel(w.endMs)),
  }));
}

function rotationFilter(rotation: 0 | 90 | 180 | 270): string {
  if (rotation === 90) return "transpose=1";
  if (rotation === 180) return "transpose=1,transpose=1";
  if (rotation === 270) return "transpose=2";
  return "";
}

function editorRotationFilter(turns: 0 | 1 | 2 | 3): string {
  if (turns === 1) return "transpose=1";
  if (turns === 2) return "transpose=1,transpose=1";
  if (turns === 3) return "transpose=2";
  return "";
}

/** Stable snapshot helper for golden tests — strips whitespace variance. */
export function normalizeGraph(graph: string): string {
  return graph.replace(/\s+/g, "");
}
