import { uprightSize } from "./validate";
import type { ProbeResult } from "./types";
import { IngestError } from "./types";

/**
 * Browser probe via HTMLVideoElement metadata.
 * Rotation from videoTracks if available; otherwise 0.
 * FFmpeg.wasm can refine codecs later when loaded.
 */
export async function probeVideoFile(
  file: File,
  container: ProbeResult["container"],
  signal?: AbortSignal,
): Promise<ProbeResult> {
  if (signal?.aborted) {
    throw new IngestError("ABORTED", "Probe aborted");
  }

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const meta = await new Promise<{
      duration: number;
      width: number;
      height: number;
    }>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new IngestError("ABORTED", "Probe aborted"));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onErr);
        signal?.removeEventListener("abort", onAbort);
      };
      const onMeta = () => {
        cleanup();
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };
      const onErr = () => {
        cleanup();
        reject(
          new IngestError(
            "PROBE_FAILED",
            "Browser could not decode video metadata",
          ),
        );
      };
      signal?.addEventListener("abort", onAbort);
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onErr);
      video.src = url;
    });

    if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
      throw new IngestError("PROBE_FAILED", "Invalid duration from probe");
    }
    if (meta.width <= 0 || meta.height <= 0) {
      throw new IngestError("PROBE_FAILED", "Invalid dimensions from probe");
    }

    let rotation: ProbeResult["rotation"] = 0;
    try {
      // Experimental MediaStreamTrack settings; may be absent
      const anyVideo = video as HTMLVideoElement & {
        videoTracks?: { getSettings?: () => { rotation?: number } }[];
      };
      const track = anyVideo.videoTracks?.[0];
      const rot = track?.getSettings?.()?.rotation;
      if (rot === 90 || rot === 180 || rot === 270 || rot === 0) {
        rotation = rot;
      }
    } catch {
      /* ignore */
    }

    const base = {
      width: meta.width,
      height: meta.height,
      rotation,
    };
    const upright = uprightSize(base);

    // Heuristic codec from container / file type
    const mime = file.type.toLowerCase();
    let videoCodec = "h264";
    if (mime.includes("hevc") || mime.includes("h265") || container === "mov") {
      // Many iPhone MOVs are HEVC; warn later in validate
      if (file.name.toLowerCase().includes("hevc")) videoCodec = "hevc";
    }

    const fpsNum = 30;
    const fpsDen = 1;

    return {
      durationMs: Math.round(meta.duration * 1000),
      width: meta.width,
      height: meta.height,
      rotation,
      displayWidth: upright.w,
      displayHeight: upright.h,
      videoCodec,
      audioCodec: "aac",
      videoBitrate: null,
      audioSampleRate: 44100,
      channels: 2,
      fpsNum,
      fpsDen,
      isVfr: false,
      hasAudio: true, // refined later if needed
      pixelFormat: null,
      container,
      warnings: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function probeImageFile(file: File): Promise<{
  width: number;
  height: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new IngestError("INVALID_IMAGE", "Could not decode image"));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
