import type { ClipCandidate } from "@/media/edit-spec/types";
import {
  buildEmbeddingBoost,
  findShortsMoments,
} from "./shortsBrain/shortsScore";
import { embedTexts } from "./shortsBrain/embeddings";
import { generateTitleAndReason } from "./shortsBrain/llmAssist";
import { scoreSentiment } from "./shortsBrain/sentiment";
import type { FaceSample } from "./faces";
import type { SceneCut } from "./scenes";

export type ScoreInput = {
  durationMs: number;
  upright: { w: number; h: number };
  scenes: SceneCut[];
  faces: FaceSample[];
  transcript?: {
    segments: { startMs: number; endMs: number; text: string }[];
    words?: { startMs: number; endMs: number; text: string }[];
  };
  lengthsMs?: number[];
  topK?: number;
  safariMode?: boolean;
  cores?: number;
  signal?: AbortSignal;
  /** When true, load embeddings / sentiment / optional LLM. */
  deep?: boolean;
};

export type ScoreResult = {
  candidates: ClipCandidate[];
  degradations: string[];
};

/**
 * Sync scoring entry — heuristics + anaphora + hash-embed novelty.
 * Used by unit tests and as the deep-path floor.
 */
export function scoreCandidates(input: ScoreInput): ClipCandidate[] {
  const lengthMs = input.lengthsMs?.[0] ?? 30_000;
  const topK = input.topK ?? 8;
  const words = input.transcript?.words ?? [];
  const segments = input.transcript?.segments ?? [];
  const wordCount =
    words.length ||
    segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

  if (wordCount < 8) {
    return [];
  }

  return findShortsMoments({
    durationMs: input.durationMs,
    upright: input.upright,
    lengthMs,
    topK,
    transcript: { segments, words },
    scenes: input.scenes,
    faces: input.faces,
  });
}

/**
 * Deep scoring: embeddings + sentiment + optional LLM titles.
 * Always falls back to sync scoreCandidates on model failure.
 */
export async function scoreCandidatesDeep(
  input: ScoreInput,
): Promise<ScoreResult> {
  const degradations: string[] = [];
  const base = scoreCandidates(input);
  if (!base.length || !input.deep || input.safariMode) {
    if (input.safariMode) degradations.push("deep_brain_skipped_safari");
    return { candidates: base, degradations };
  }

  try {
    const quotes = base.map((c) => c.quote || c.reason);
    const emb = await embedTexts(quotes, {
      safariMode: input.safariMode,
      signal: input.signal,
    });
    degradations.push(...emb.degradations);

    const sentimentByText = new Map<string, number>();
    let usedHeuristicSentiment = false;
    for (const c of base) {
      const text = c.quote || "";
      if (!text) continue;
      const s = await scoreSentiment(text, {
        safariMode: input.safariMode,
        signal: input.signal,
      });
      if (!s.neural) usedHeuristicSentiment = true;
      sentimentByText.set(text, s.intensity);
    }
    if (usedHeuristicSentiment) degradations.push("sentiment_heuristic");

    const lengthMs = input.lengthsMs?.[0] ?? 30_000;
    const topK = input.topK ?? 8;
    const candidates = findShortsMoments({
      durationMs: input.durationMs,
      upright: input.upright,
      lengthMs,
      topK,
      transcript: {
        segments: input.transcript?.segments ?? [],
        words: input.transcript?.words ?? [],
      },
      scenes: input.scenes,
      faces: input.faces,
      embeddingBoost: buildEmbeddingBoost(quotes, emb),
      sentimentByText,
    });

    // Optional LLM polish for titles/reasons (top results only)
    const polished: ClipCandidate[] = [];
    for (const c of candidates) {
      const assist = await generateTitleAndReason(c.quote || "", c.reason, {
        safariMode: input.safariMode,
        cores: input.cores,
        signal: input.signal,
      });
      polished.push({
        ...c,
        quote: c.quote,
        title: assist.title,
        reason: assist.reason,
      });
    }

    return {
      candidates: polished,
      degradations: [...new Set(degradations)],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    degradations.push(`deep_brain_failed:${msg.slice(0, 120)}`);
    return { candidates: base, degradations };
  }
}

export function hasUsableTranscript(
  transcript?: ScoreInput["transcript"],
): boolean {
  if (!transcript) return false;
  const words = transcript.words?.length ?? 0;
  const segWords = (transcript.segments ?? []).reduce(
    (n, s) => n + s.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  return words >= 8 || segWords >= 8;
}
