import type { TimedWord } from "@/media/edit-spec/types";
import { extractMonoPcm16k } from "@/media/render/ffmpegClient";

export type TranscriptResult = {
  language?: string;
  segments: { startMs: number; endMs: number; text: string }[];
  words?: TimedWord[];
};

export type WhisperProgress = (percent: number, message: string) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineSingleton: any = null;
let pipelineLoading: Promise<unknown> | null = null;

/** CDN build is reliable under COEP; Next webpack often breaks onnxruntime-web v4. */
const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

/**
 * Free on-device Whisper via Transformers.js (lazy, browser-only).
 * Degrades with whisper_* codes — never throws fatal.
 */
export async function transcribeWhisper(
  file: File,
  opts?: {
    signal?: AbortSignal;
    onProgress?: WhisperProgress;
    safariMode?: boolean;
  },
): Promise<{ transcript?: TranscriptResult; degradations: string[] }> {
  const degradations: string[] = [];

  if (opts?.safariMode) {
    degradations.push("whisper_skipped_safari_mode");
    return { degradations };
  }

  try {
    opts?.onProgress?.(8, "Extracting audio");
    const pcm = await extractAudio(file, opts?.signal, opts?.onProgress);

    // Pipeline requires a real Float32Array (not Array / detached WASM view)
    const audio = toPlainFloat32(pcm.audioData);
    if (audio.length < 1600) {
      throw new Error("No usable audio track found in this file");
    }

    if (opts?.signal?.aborted) {
      degradations.push("whisper_aborted");
      return { degradations };
    }

    opts?.onProgress?.(28, "Loading Whisper (first run downloads ~40MB)");
    const transcriber = await getTranscriber((msg) =>
      opts?.onProgress?.(35, msg),
    );

    if (opts?.signal?.aborted) {
      degradations.push("whisper_aborted");
      return { degradations };
    }

    opts?.onProgress?.(55, "Transcribing speech");

    // Pass Float32Array only — blob URLs hit aud.subarray errors under COEP
    let result = await transcriber(audio, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    if (!hasAnyText(result)) {
      result = await transcriber(audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
    }
    if (!hasAnyText(result)) {
      result = await transcriber(audio, {});
    }

    opts?.onProgress?.(95, "Merging transcript");
    const transcript = normalizeWhisperResult(result, pcm.durationMs);
    const wordCount = countWords(transcript);

    if (wordCount < 8) {
      degradations.push("whisper_low_speech");
      return { transcript, degradations };
    }

    return { transcript, degradations };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[whisper]", err);
    if (msg.toLowerCase().includes("memory") || msg.includes("OOM")) {
      degradations.push("whisper_oom");
    } else if (
      /no usable audio|audio extract|demux|decodeAudioData|EncodingError|FFmpeg/i.test(
        msg,
      )
    ) {
      degradations.push("whisper_audio_extract_failed");
    } else if (/Failed to fetch|network|CORS|Load.*model/i.test(msg)) {
      degradations.push("whisper_unavailable");
    } else if (/subarray is not a function/i.test(msg)) {
      degradations.push("whisper_failed");
      degradations.push(
        "whisper_detail:Audio tensor shape mismatch — hard-refresh and retry",
      );
      return { degradations };
    } else {
      degradations.push("whisper_failed");
    }
    degradations.push(`whisper_detail:${msg.slice(0, 220)}`);
    return { degradations };
  }
}

/** Copy into a standalone Float32Array (Whisper calls .subarray on it). */
function toPlainFloat32(input: ArrayLike<number>): Float32Array {
  if (input instanceof Float32Array) {
    const copy = new Float32Array(input.length);
    copy.set(input);
    return copy;
  }
  return Float32Array.from(input);
}

async function getTranscriber(
  onMsg?: (message: string) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (pipelineSingleton) return pipelineSingleton;
  if (pipelineLoading) {
    await pipelineLoading;
    return pipelineSingleton;
  }

  pipelineLoading = (async () => {
    const { pipeline, env } = await loadTransformers();
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    pipelineSingleton = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny.en",
      {
        // Explicit dtype silences "dtype not specified" wasm warnings
        dtype: "q8",
        progress_callback: (p: {
          status?: string;
          progress?: number;
          file?: string;
        }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onMsg?.(
              `Downloading model ${Math.round(p.progress)}%${p.file ? ` (${p.file})` : ""}`,
            );
          } else if (p.status === "done" || p.status === "ready") {
            onMsg?.("Whisper ready");
          }
        },
      },
    );
  })();

  try {
    await pipelineLoading;
    return pipelineSingleton;
  } finally {
    pipelineLoading = null;
  }
}

async function loadTransformers(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: any;
}> {
  try {
    const mod = await (Function(
      "u",
      "return import(/* webpackIgnore: true */ u)",
    )(TRANSFORMERS_CDN) as Promise<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipeline: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: any;
    }>);
    return mod;
  } catch (cdnErr) {
    console.warn("[whisper] CDN load failed, trying npm package", cdnErr);
    const mod = await import("@huggingface/transformers");
    return mod as never;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAnyText(result: any): boolean {
  if (typeof result?.text === "string" && result.text.trim().length >= 3) {
    return true;
  }
  if (Array.isArray(result?.chunks) && result.chunks.length > 0) {
    return result.chunks.some(
      (c: { text?: string }) => String(c.text ?? "").trim().length > 0,
    );
  }
  return false;
}

function countWords(transcript: TranscriptResult): number {
  const fromWords = transcript.words?.length ?? 0;
  if (fromWords) return fromWords;
  return transcript.segments.reduce(
    (n, s) => n + s.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}

async function extractAudio(
  file: File,
  signal?: AbortSignal,
  onProgress?: WhisperProgress,
): Promise<{ audioData: Float32Array; durationMs: number }> {
  if (signal?.aborted) throw new Error("aborted");

  // Prefer Web Audio first — works for many mp4s in Chrome and avoids worker COEP
  try {
    onProgress?.(12, "Decoding audio");
    const viaWebAudio = await extractViaWebAudio(file, signal);
    if (viaWebAudio.audioData.length >= 1600) return viaWebAudio;
  } catch {
    /* fall through to ffmpeg */
  }

  onProgress?.(15, "Demuxing audio with FFmpeg");
  return extractMonoPcm16k(file, {
    maxSeconds: 8 * 60,
    onProgress: (ev) =>
      onProgress?.(ev.percent ?? 15, ev.message ?? "Extracting audio"),
  });
}

async function extractViaWebAudio(
  file: File,
  signal?: AbortSignal,
): Promise<{ audioData: Float32Array; durationMs: number }> {
  if (signal?.aborted) throw new Error("aborted");
  const buffer = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const ch0 = decoded.getChannelData(0);
    let mono: Float32Array;
    if (decoded.numberOfChannels > 1) {
      const ch1 = decoded.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2;
    } else {
      mono = new Float32Array(ch0.length);
      mono.set(ch0);
    }
    if (decoded.sampleRate !== 16000) {
      mono = downsample(mono, decoded.sampleRate, 16000);
    }
    const maxSamples = 16000 * 8 * 60;
    if (mono.length > maxSamples) {
      mono = mono.slice(0, maxSamples);
    }
    return {
      audioData: mono,
      durationMs: Math.round((mono.length / 16000) * 1000),
    };
  } finally {
    await ctx.close();
  }
}

function downsample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLen = Math.floor(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    out[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeWhisperResult(
  result: any,
  fallbackDurationMs: number,
): TranscriptResult {
  const chunks = result?.chunks ?? [];
  const words: TimedWord[] = [];
  const segments: TranscriptResult["segments"] = [];

  if (Array.isArray(chunks) && chunks.length) {
    const looksLikeWords = chunks.every(
      (c: { text?: string }) =>
        String(c.text ?? "")
          .trim()
          .split(/\s+/).length <= 3,
    );

    for (const c of chunks) {
      const t0 = Number(c.timestamp?.[0] ?? 0);
      const t1 = Number(c.timestamp?.[1] != null ? c.timestamp[1] : t0 + 0.4);
      const startMs = Math.round(t0 * 1000);
      const endMs = Math.round(Math.max(t1, t0 + 0.05) * 1000);
      const text = String(c.text ?? "").trim();
      if (!text) continue;
      if (looksLikeWords) {
        words.push({ startMs, endMs: Math.max(endMs, startMs + 50), text });
      } else {
        segments.push({
          startMs,
          endMs: Math.max(endMs, startMs + 200),
          text,
        });
      }
    }

    if (words.length && !segments.length) {
      for (let i = 0; i < words.length; i += 8) {
        const slice = words.slice(i, i + 8);
        segments.push({
          startMs: slice[0].startMs,
          endMs: slice[slice.length - 1].endMs,
          text: slice.map((w) => w.text).join(" "),
        });
      }
    }
  } else if (typeof result?.text === "string" && result.text.trim()) {
    segments.push({
      startMs: 0,
      endMs: Math.max(1000, fallbackDurationMs),
      text: result.text.trim(),
    });
  }

  return { language: "en", segments, words };
}
