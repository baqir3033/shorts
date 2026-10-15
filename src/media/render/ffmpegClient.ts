import type { ProgressEvent } from "@/media/edit-spec/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegSingleton: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loading: Promise<any> | null = null;
let busy = false;

function ffmpegPublicBase(): string {
  if (typeof window === "undefined") return "/ffmpeg";
  return `${window.location.origin}/ffmpeg`;
}

async function preflightAssets(): Promise<void> {
  const base = ffmpegPublicBase();
  for (const name of ["worker.js", "ffmpeg-core.js", "const.js"]) {
    const res = await fetch(`${base}/${name}`, { method: "HEAD" });
    if (!res.ok) {
      throw new Error(
        `Missing FFmpeg asset ${name} (${res.status}). Restart the dev server.`,
      );
    }
  }
}

/** Shared browser FFmpeg instance (ffmpeg.wasm). */
export async function getFFmpeg(
  onProgress?: (ev: ProgressEvent) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.({ phase: "load_wasm", percent: 5, message: "Loading FFmpeg" });
    await preflightAssets();

    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();
    const logs: string[] = [];
    ffmpeg.on("log", ({ message }: { message: string }) => {
      logs.push(message);
      if (logs.length > 80) logs.shift();
      (ffmpeg as { __logs?: string[] }).__logs = logs;
    });

    const base = ffmpegPublicBase();
    await ffmpeg.load({
      classWorkerURL: `${base}/worker.js`,
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegSingleton = ffmpeg;
    onProgress?.({ phase: "load_wasm", percent: 15, message: "FFmpeg ready" });
    return ffmpeg;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function withFFmpegLock<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new Error("FFmpeg is busy with another job");
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

export function isFFmpegBusy(): boolean {
  return busy;
}

export async function terminateFFmpeg(): Promise<void> {
  if (ffmpegSingleton) {
    try {
      ffmpegSingleton.terminate();
    } catch {
      /* ignore */
    }
    ffmpegSingleton = null;
  }
  busy = false;
}

/**
 * Extract mono 16 kHz float32 PCM from a video/audio file via ffmpeg.
 * Caps length to maxSeconds to keep Whisper memory-safe.
 */
export async function extractMonoPcm16k(
  file: File | Blob,
  opts?: {
    maxSeconds?: number;
    onProgress?: (ev: ProgressEvent) => void;
  },
): Promise<{ audioData: Float32Array; durationMs: number }> {
  const maxSeconds = opts?.maxSeconds ?? 600;
  const { fetchFile } = await import("@ffmpeg/util");

  return withFFmpegLock(async () => {
    const ffmpeg = await getFFmpeg(opts?.onProgress);
    opts?.onProgress?.({
      phase: "write_inputs",
      percent: 10,
      message: "Extracting audio",
    });

    const inName = "asr_in.mp4";
    const outName = "asr.f32";
    await ffmpeg.writeFile(inName, await fetchFile(file));

    const code = await ffmpeg.exec([
      "-i",
      inName,
      "-t",
      String(maxSeconds),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      outName,
    ]);

    if (typeof code === "number" && code !== 0) {
      const logs = ((ffmpeg as { __logs?: string[] }).__logs ?? [])
        .slice(-8)
        .join(" | ");
      throw new Error(`Audio extract failed${logs ? `: ${logs}` : ""}`);
    }

    const data = await ffmpeg.readFile(outName);
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data as Uint8Array);

    // Copy out of WASM heap before deleting files
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const audioData = new Float32Array(
      copy.buffer,
      copy.byteOffset,
      Math.floor(copy.byteLength / 4),
    );

    try {
      await ffmpeg.deleteFile(inName);
      await ffmpeg.deleteFile(outName);
    } catch {
      /* ignore */
    }

    if (audioData.length < 1600) {
      throw new Error("No usable audio track found in this file");
    }

    return {
      audioData,
      durationMs: Math.round((audioData.length / 16000) * 1000),
    };
  });
}
