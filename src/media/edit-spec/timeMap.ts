import type { SpeedSegment } from "./types";

export type RatePiece = {
  /** Absolute source ms */
  startMs: number;
  endMs: number;
  rate: number;
};

function clampRate(rate: number): number {
  return Math.min(4, Math.max(0.25, rate));
}

/** Normalize speed segments inside [windowStart, windowEnd]; gaps use globalRate. */
export function buildRatePieces(
  windowStartMs: number,
  windowEndMs: number,
  globalRate: number,
  segments?: SpeedSegment[] | null,
): RatePiece[] {
  const winStart = Math.max(0, windowStartMs);
  const winEnd = Math.max(winStart + 1, windowEndMs);
  const base = clampRate(globalRate || 1);

  const cleaned = (segments ?? [])
    .map((s) => ({
      startMs: Math.max(winStart, s.startMs),
      endMs: Math.min(winEnd, s.endMs),
      rate: clampRate(s.rate),
    }))
    .filter((s) => s.endMs > s.startMs + 1)
    .sort((a, b) => a.startMs - b.startMs);

  // Drop overlaps (keep earlier)
  const nonOverlap: typeof cleaned = [];
  let cursor = winStart;
  for (const s of cleaned) {
    if (s.startMs < cursor) {
      if (s.endMs <= cursor) continue;
      nonOverlap.push({ ...s, startMs: cursor });
    } else {
      nonOverlap.push(s);
    }
    cursor = Math.max(cursor, nonOverlap[nonOverlap.length - 1].endMs);
  }

  const pieces: RatePiece[] = [];
  let t = winStart;
  for (const s of nonOverlap) {
    if (s.startMs > t) {
      pieces.push({ startMs: t, endMs: s.startMs, rate: base });
    }
    pieces.push(s);
    t = s.endMs;
  }
  if (t < winEnd) {
    pieces.push({ startMs: t, endMs: winEnd, rate: base });
  }
  if (!pieces.length) {
    pieces.push({ startMs: winStart, endMs: winEnd, rate: base });
  }
  return pieces;
}

/** Wall-clock output duration for the window under the rate map. */
export function outputDurationMs(pieces: RatePiece[]): number {
  let out = 0;
  for (const p of pieces) {
    out += (p.endMs - p.startMs) / p.rate;
  }
  return out;
}

/** Map absolute source ms → output ms from window start. */
export function sourceToOutputMs(
  sourceMs: number,
  pieces: RatePiece[],
): number {
  let out = 0;
  for (const p of pieces) {
    if (sourceMs <= p.startMs) return out;
    if (sourceMs >= p.endMs) {
      out += (p.endMs - p.startMs) / p.rate;
      continue;
    }
    out += (sourceMs - p.startMs) / p.rate;
    return out;
  }
  return out;
}

/** Map output ms (from window start) → absolute source ms. */
export function outputToSourceMs(outputMs: number, pieces: RatePiece[]): number {
  let remaining = Math.max(0, outputMs);
  for (const p of pieces) {
    const pieceOut = (p.endMs - p.startMs) / p.rate;
    if (remaining <= pieceOut) {
      return p.startMs + remaining * p.rate;
    }
    remaining -= pieceOut;
  }
  return pieces[pieces.length - 1]?.endMs ?? 0;
}

/** Rate active at absolute source time. */
export function rateAtSourceMs(sourceMs: number, pieces: RatePiece[]): number {
  for (const p of pieces) {
    if (sourceMs >= p.startMs && sourceMs < p.endMs) return p.rate;
  }
  return pieces[pieces.length - 1]?.rate ?? 1;
}

/**
 * Chain atempo filters for a single rate (ffmpeg atempo supports 0.5..2 only).
 */
export function atempoChain(rate: number): string {
  let r = clampRate(rate);
  if (Math.abs(r - 1) < 0.001) return "anull";
  const parts: string[] = [];
  // Speed up: multiply; slow down: divide into 0.5..2 steps
  while (r > 2.001) {
    parts.push("atempo=2.0");
    r /= 2;
  }
  while (r < 0.5 - 0.001) {
    parts.push("atempo=0.5");
    r /= 0.5;
  }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(",");
}
