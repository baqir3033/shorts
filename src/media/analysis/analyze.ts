import type { AnalysisResult, ProgressEvent } from "@/media/edit-spec/types";
import type { ProbeResult } from "@/media/ingest/types";
import { uprightSize } from "@/media/render/layoutMath";
import { detectFaces } from "./faces";
import { recommendLayouts } from "./recommendLayout";
import { sampleFrames } from "./sampleFrames";
import { detectScenes } from "./scenes";
import {
  hasUsableTranscript,
  scoreCandidatesDeep,
} from "./scoreCandidates";
import { transcribeWhisper } from "./whisper";

export type AnalyzeOptions = {
  probe: ProbeResult;
  signal?: AbortSignal;
  safariMode?: boolean;
  cores?: number;
  lengthMs?: number;
  topK?: number;
  onProgress?: (ev: ProgressEvent) => void;
};

/**
 * analyze(media, opts) → AnalysisResult
 * Suggest candidates only when transcript is usable.
 * Deep brain (embeddings/sentiment/LLM) loads when not in safari mode.
 */
export async function analyze(
  file: File,
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const degradations: string[] = [];
  const report = (phase: string, percent: number, message?: string) =>
    opts.onProgress?.({ phase, percent, message });

  report("whisper", 8, "Transcribing speech");
  const asr = await transcribeWhisper(file, {
    signal: opts.signal,
    safariMode: opts.safariMode,
    onProgress: (p, m) => report("whisper", 8 + Math.round(p * 0.35), m),
  });
  degradations.push(...asr.degradations);

  report("frames", 45, "Sampling frames");
  let frames = [] as Awaited<ReturnType<typeof sampleFrames>>;
  try {
    frames = await sampleFrames(file, {
      signal: opts.signal,
      onProgress: (done, total) =>
        report(
          "frames",
          45 + Math.round((done / total) * 20),
          "Sampling frames",
        ),
    });
  } catch {
    degradations.push("frame_sample_failed");
  }

  report("scenes", 68, "Detecting scenes");
  const scenes = frames.length ? detectScenes(frames) : [];

  report("faces", 75, "Detecting faces");
  const faceResult = frames.length
    ? await detectFaces(frames, { signal: opts.signal })
    : { samples: [], degradations: ["no_frames"] };
  degradations.push(...faceResult.degradations);

  for (const f of frames) {
    (f as { imageData?: ImageData }).imageData =
      undefined as unknown as ImageData;
  }
  frames = [];

  report("score", 88, "Finding short-worthy moments");
  const upright = uprightSize(opts.probe);
  const usable = hasUsableTranscript(asr.transcript);
  if (!usable) {
    degradations.push("transcript_unusable");
  }

  let candidates: AnalysisResult["candidates"] = [];
  if (usable) {
    report("score", 90, "Deep ranking (embeddings + sentiment)");
    const scored = await scoreCandidatesDeep({
      durationMs: opts.probe.durationMs,
      upright,
      scenes,
      faces: faceResult.samples,
      transcript: asr.transcript,
      lengthsMs: [opts.lengthMs ?? 30_000],
      topK: opts.topK ?? 8,
      safariMode: opts.safariMode,
      cores: opts.cores,
      signal: opts.signal,
      deep: true,
    });
    candidates = scored.candidates;
    degradations.push(...scored.degradations);
  }

  const layoutSuggestions = recommendLayouts({
    probe: opts.probe,
    faces: faceResult.samples,
    hasReactionIntent: false,
  });

  report("persist", 100, "Done");

  const status: AnalysisResult["status"] =
    !usable
      ? "partial"
      : candidates.length === 0
        ? "partial"
        : degradations.length
          ? "partial"
          : "complete";

  return {
    version: 1,
    status,
    probe: opts.probe,
    scenes,
    faces: faceResult.samples,
    transcript: asr.transcript,
    candidates,
    layoutSuggestions,
    degradations: [...new Set(degradations)],
  };
}
