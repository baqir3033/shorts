import { SCENE_MERGE_GAP_MS } from "@/lib/constants";
import type { SampledFrame } from "./sampleFrames";

export type SceneCut = { tMs: number; score: number };

/**
 * Histogram / mean-luma + chroma diff with hysteresis.
 * Merges cuts closer than SCENE_MERGE_GAP_MS; ignores single-sample flashes.
 */
export function detectScenes(
  frames: SampledFrame[],
  opts?: { threshold?: number; mergeGapMs?: number },
): SceneCut[] {
  if (frames.length < 2) return [];

  const threshold = opts?.threshold ?? 0.28;
  const mergeGap = opts?.mergeGapMs ?? SCENE_MERGE_GAP_MS;
  const diffs: { tMs: number; score: number }[] = [];

  let prev = frameStats(frames[0].imageData);
  for (let i = 1; i < frames.length; i++) {
    const cur = frameStats(frames[i].imageData);
    const score =
      Math.abs(cur.luma - prev.luma) * 0.5 +
      Math.abs(cur.cb - prev.cb) * 0.25 +
      Math.abs(cur.cr - prev.cr) * 0.25 +
      histDiff(prev.hist, cur.hist) * 0.5;
    diffs.push({ tMs: frames[i].tMs, score });
    prev = cur;
  }

  // Hysteresis: cut must exceed threshold and neighbors must be lower (not flash)
  const raw: SceneCut[] = [];
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    if (d.score < threshold) continue;
    const prevScore = i > 0 ? diffs[i - 1].score : 0;
    const nextScore = i + 1 < diffs.length ? diffs[i + 1].score : 0;
    if (d.score >= prevScore && d.score >= nextScore) {
      raw.push(d);
    }
  }

  // Merge close cuts
  const merged: SceneCut[] = [];
  for (const cut of raw) {
    const last = merged[merged.length - 1];
    if (last && cut.tMs - last.tMs < mergeGap) {
      if (cut.score > last.score) {
        merged[merged.length - 1] = cut;
      }
    } else {
      merged.push(cut);
    }
  }

  return merged;
}

function frameStats(data: ImageData): {
  luma: number;
  cb: number;
  cr: number;
  hist: Float32Array;
} {
  const { data: px } = data;
  let luma = 0;
  let cb = 0;
  let cr = 0;
  const hist = new Float32Array(16);
  const n = data.width * data.height;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma += y;
    cb += b - y;
    cr += r - y;
    const bin = Math.min(15, Math.floor(y * 16));
    hist[bin] += 1;
  }
  for (let i = 0; i < 16; i++) hist[i] /= n;
  return { luma: luma / n, cb: cb / n, cr: cr / n, hist };
}

function histDiff(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s;
}
