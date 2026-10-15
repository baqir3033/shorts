import type { TimeRange } from "@/media/edit-spec/jumpCutPlan";

/**
 * Detect low-energy silence ranges from mono PCM.
 * sampleRate defaults to 16000 (Whisper/WebAudio path).
 */
export function detectSilenceFromPcm(
  pcm: Float32Array,
  opts: {
    sampleRate?: number;
    /** RMS below this counts as silence (0..1). */
    rmsThreshold?: number;
    /** Min silence length to report (ms). */
    minSilenceMs?: number;
    /** Analysis hop (ms). */
    hopMs?: number;
  } = {},
): TimeRange[] {
  const sampleRate = opts.sampleRate ?? 16_000;
  const rmsThreshold = opts.rmsThreshold ?? 0.012;
  const minSilenceMs = opts.minSilenceMs ?? 400;
  const hopMs = opts.hopMs ?? 50;
  const hop = Math.max(1, Math.floor((sampleRate * hopMs) / 1000));
  const minHops = Math.max(1, Math.ceil(minSilenceMs / hopMs));

  if (pcm.length < hop) return [];

  const silentFlags: boolean[] = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const s = pcm[i + j] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / hop);
    silentFlags.push(rms < rmsThreshold);
  }

  const ranges: TimeRange[] = [];
  let runStart = -1;
  let runLen = 0;
  for (let i = 0; i < silentFlags.length; i++) {
    if (silentFlags[i]) {
      if (runStart < 0) runStart = i;
      runLen++;
    } else if (runStart >= 0) {
      if (runLen >= minHops) {
        ranges.push({
          startMs: Math.round(runStart * hopMs),
          endMs: Math.round((runStart + runLen) * hopMs),
        });
      }
      runStart = -1;
      runLen = 0;
    }
  }
  if (runStart >= 0 && runLen >= minHops) {
    ranges.push({
      startMs: Math.round(runStart * hopMs),
      endMs: Math.round((runStart + runLen) * hopMs),
    });
  }
  return ranges;
}

/** Decode file to mono 16k PCM via Web Audio (browser). */
export async function extractMonoPcmForSilence(
  file: File,
  signal?: AbortSignal,
): Promise<{ pcm: Float32Array; sampleRate: number; durationMs: number }> {
  if (signal?.aborted) throw new Error("aborted");
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) throw new Error("aborted");
  const ctx = new AudioContext({ sampleRate: 16_000 });
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
    let sampleRate = decoded.sampleRate;
    if (sampleRate !== 16_000) {
      mono = downsample(mono, sampleRate, 16_000);
      sampleRate = 16_000;
    }
    const maxSamples = 16_000 * 15 * 60;
    if (mono.length > maxSamples) mono = mono.subarray(0, maxSamples);
    return {
      pcm: mono,
      sampleRate,
      durationMs: Math.round((mono.length / sampleRate) * 1000),
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

/** Full pipeline: file → silence ranges. */
export async function detectSilenceInFile(
  file: File,
  opts?: {
    minSilenceMs?: number;
    rmsThreshold?: number;
    signal?: AbortSignal;
  },
): Promise<TimeRange[]> {
  const { pcm, sampleRate } = await extractMonoPcmForSilence(
    file,
    opts?.signal,
  );
  return detectSilenceFromPcm(pcm, {
    sampleRate,
    minSilenceMs: opts?.minSilenceMs ?? 400,
    rmsThreshold: opts?.rmsThreshold,
  });
}
