import {
  FRAME_SAMPLE_INTERVAL_MS,
  MAX_SAMPLE_FRAMES,
} from "@/lib/constants";

export type SampledFrame = {
  tMs: number;
  /** Downscaled ImageData for scene/face analysis (longest edge ~320–480). */
  imageData: ImageData;
  width: number;
  height: number;
};

export type SampleProgress = (done: number, total: number) => void;

/**
 * Sample frames at ~2 fps using HTMLVideoElement + canvas.
 * Caps at MAX_SAMPLE_FRAMES for memory safety.
 */
export async function sampleFrames(
  file: File,
  opts?: {
    intervalMs?: number;
    maxFrames?: number;
    longestEdge?: number;
    signal?: AbortSignal;
    onProgress?: SampleProgress;
  },
): Promise<SampledFrame[]> {
  const intervalMs = opts?.intervalMs ?? FRAME_SAMPLE_INTERVAL_MS;
  const maxFrames = opts?.maxFrames ?? MAX_SAMPLE_FRAMES;
  const longestEdge = opts?.longestEdge ?? 360;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video for sampling"));
  });

  const durationMs = Math.round(video.duration * 1000);
  const times: number[] = [];
  for (let t = 0; t < durationMs && times.length < maxFrames; t += intervalMs) {
    times.push(t);
  }

  const scale =
    Math.max(video.videoWidth, video.videoHeight) > longestEdge
      ? longestEdge / Math.max(video.videoWidth, video.videoHeight)
      : 1;
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");

  const frames: SampledFrame[] = [];
  try {
    for (let i = 0; i < times.length; i++) {
      if (opts?.signal?.aborted) break;
      const tMs = times[i];
      await seekVideo(video, tMs / 1000);
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      frames.push({ tMs, imageData, width: w, height: h });
      opts?.onProgress?.(i + 1, times.length);
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }

  return frames;
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Seek failed"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.min(timeSec, Math.max(0, video.duration - 0.05));
  });
}
