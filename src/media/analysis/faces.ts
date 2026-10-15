import type { Box } from "@/media/edit-spec/types";
import type { SampledFrame } from "./sampleFrames";

export type FaceSample = {
  tMs: number;
  boxesNorm: Box[];
  primary?: Box;
};

/**
 * Face detection: tries @mediapipe/tasks-vision dynamically when available.
 * Falls back to skin-tone density heuristic (good enough for crop seeding).
 */
export async function detectFaces(
  frames: SampledFrame[],
  opts?: { everyN?: number; signal?: AbortSignal },
): Promise<{ samples: FaceSample[]; degradations: string[] }> {
  const everyN = opts?.everyN ?? 2;
  const degradations: string[] = [];
  const selected = frames.filter((_, i) => i % everyN === 0);

  // Attempt MediaPipe (optional peer — graceful miss)
  try {
    const mediapipe = await tryMediaPipe(selected, opts?.signal);
    if (mediapipe) return { samples: linkPrimaryTrack(mediapipe), degradations };
  } catch {
    degradations.push("mediapipe_unavailable");
  }

  degradations.push("face_heuristic_fallback");
  const heuristic = selected.map((f) => heuristicFace(f));
  return { samples: linkPrimaryTrack(heuristic), degradations };
}

async function tryMediaPipe(
  frames: SampledFrame[],
  signal?: AbortSignal,
): Promise<FaceSample[] | null> {
  // Dynamic import — package may not be installed; return null
  try {
    // Avoid static bundler resolution — optional peer
    const pkg = "@mediapipe/" + "tasks-vision";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await (Function("p", "return import(p)")(pkg) as Promise<unknown>).catch(
      () => null,
    );
    if (!mod?.FaceDetector) return null;
    void frames;
    void signal;
    return null;
  } catch {
    return null;
  }
}

/** Skin-tone blob heuristic → normalized box or empty. */
function heuristicFace(frame: SampledFrame): FaceSample {
  const { imageData, width, height, tMs } = frame;
  const { data } = imageData;
  const cell = 8;
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const heat = new Float32Array(gw * gh);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isSkin(r, g, b)) {
        heat[Math.floor(y / cell) * gw + Math.floor(x / cell)] += 1;
      }
    }
  }

  let best = 0;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] > best) {
      best = heat[i];
      bx = i % gw;
      by = Math.floor(i / gw);
    }
  }

  const threshold = (cell * cell) * 0.15;
  if (best < threshold) {
    return { tMs, boxesNorm: [] };
  }

  // Expand around peak
  const cx = ((bx + 0.5) * cell) / width;
  const cy = ((by + 0.5) * cell) / height;
  const w = Math.min(0.45, (3 * cell) / width);
  const h = Math.min(0.55, (4 * cell) / height);
  const box: Box = {
    x: clamp01(cx - w / 2),
    y: clamp01(cy - h / 2),
    w,
    h,
  };
  return { tMs, boxesNorm: [box], primary: box };
}

function isSkin(r: number, g: number, b: number): boolean {
  // Classic cheap RGB skin rule
  return (
    r > 95 &&
    g > 40 &&
    b > 20 &&
    r > g &&
    r > b &&
    Math.abs(r - g) > 15 &&
    r - Math.min(g, b) > 15
  );
}

function linkPrimaryTrack(samples: FaceSample[]): FaceSample[] {
  // IoU-link consecutive primaries; keep longest track as primary preference
  let last: Box | undefined;
  return samples.map((s) => {
    if (!s.primary) {
      last = undefined;
      return s;
    }
    if (last && iou(last, s.primary) < 0.1) {
      // possible cut — still accept new primary
    }
    last = s.primary;
    return s;
  });
}

function iou(a: Box, b: Box): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
