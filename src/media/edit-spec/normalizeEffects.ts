import type { EditSpec, SpeedSegment, TransitionSpec } from "./types";
import { clampLook, defaultLook, type LookKnobs } from "./lookPresets";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

export function normalizeSpeedSegments(
  windowStartMs: number,
  windowEndMs: number,
  segments?: SpeedSegment[] | null,
): SpeedSegment[] | undefined {
  if (!segments?.length) return undefined;
  const cleaned = segments
    .map((s) => ({
      startMs: clamp(s.startMs, windowStartMs, windowEndMs),
      endMs: clamp(s.endMs, windowStartMs, windowEndMs),
      rate: clamp(s.rate, 0.25, 4),
    }))
    .filter((s) => s.endMs > s.startMs + 1)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 10);

  const out: SpeedSegment[] = [];
  let cursor = windowStartMs;
  for (const s of cleaned) {
    if (s.endMs <= cursor) continue;
    const startMs = Math.max(cursor, s.startMs);
    out.push({ startMs, endMs: s.endMs, rate: s.rate });
    cursor = s.endMs;
  }
  return out.length ? out : undefined;
}

export function normalizeTransitions(
  transitions?: TransitionSpec[] | null,
): TransitionSpec[] | undefined {
  if (!transitions?.length) return undefined;
  return transitions.map((t) => ({
    ...t,
    type: t.type === "swipe_left" ? "dissolve" : t.type,
    durationMs: clamp(t.durationMs, 0, 500),
  }));
}

/** Clamp/sort effects fields; safe to call after every EffectsPanel patch. */
export function normalizeEffects(spec: EditSpec): EditSpec {
  const start = spec.source.startMs;
  const end = spec.source.endMs;
  const look: LookKnobs | undefined = spec.look
    ? clampLook(spec.look)
    : undefined;

  const playbackRate = clamp(spec.source.playbackRate ?? 1, 0.25, 4);
  const fadeInMs = clamp(spec.source.fadeInMs ?? 0, 0, 2000);
  const fadeOutMs = clamp(spec.source.fadeOutMs ?? 0, 0, 2000);
  const rotateQuarterTurns = ([0, 1, 2, 3] as const).includes(
    (spec.source.rotateQuarterTurns ?? 0) as 0 | 1 | 2 | 3,
  )
    ? ((spec.source.rotateQuarterTurns ?? 0) as 0 | 1 | 2 | 3)
    : 0;

  let jumpCuts = spec.jumpCuts;
  if (jumpCuts) {
    jumpCuts = {
      enabled: !!jumpCuts.enabled,
      removeSilencesAboveMs: clamp(jumpCuts.removeSilencesAboveMs, 100, 5000),
      transitionMs: clamp(jumpCuts.transitionMs, 0, 500),
    };
  }

  return {
    ...spec,
    source: {
      ...spec.source,
      playbackRate,
      speedSegments: normalizeSpeedSegments(
        start,
        end,
        spec.source.speedSegments,
      ),
      flipX: !!spec.source.flipX,
      flipY: !!spec.source.flipY,
      rotateQuarterTurns,
      fadeInMs,
      fadeOutMs,
      sourceMuted: !!spec.source.sourceMuted,
    },
    look: look ?? undefined,
    jumpCuts,
    transitions: normalizeTransitions(spec.transitions),
    textOverlays: spec.textOverlays?.slice(0, 10).map((o) => ({
      ...o,
      text: o.text.slice(0, 200),
      startMs: Math.max(0, o.startMs),
      endMs: Math.max(o.startMs + 100, o.endMs),
      positionNorm: {
        x: clamp(o.positionNorm.x, 0, 1),
        y: clamp(o.positionNorm.y, 0, 1),
      },
      fontSize: clamp(o.fontSize, 24, 120),
    })),
  };
}

export function ensureLook(spec: EditSpec): LookKnobs {
  return spec.look ? clampLook(spec.look) : defaultLook();
}
