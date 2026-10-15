import type { Box, ClipCandidate } from "@/media/edit-spec/types";
import { centerCrop9x16 } from "@/media/render/layoutMath";
import type { SceneCut } from "../scenes";
import { resolveAnaphora } from "./anaphora";
import {
  centroid,
  cosineSimilarity,
  hashEmbed,
  standaloneScore,
  type EmbeddingResult,
} from "./embeddings";
import {
  buildUtterances,
  contentWordCount,
  endsWithPunch,
  fillerRatio,
  hookStrength,
  quoteFromWindow,
  seedStartsFromUtterances,
  snapEndToPayoff,
  textInWindow,
  utterancesInWindow,
} from "./momentFinders";
import { pickDiverse } from "./diversity";
import { heuristicSentiment } from "./sentiment";
import { templateReason, templateTitle } from "./llmAssist";

export type ShortsBrainInput = {
  durationMs: number;
  upright: { w: number; h: number };
  lengthMs: number;
  topK: number;
  transcript: {
    segments?: { startMs: number; endMs: number; text: string }[];
    words?: { startMs: number; endMs: number; text: string }[];
  };
  scenes?: SceneCut[];
  faces?: unknown[];
  /** Optional precomputed embeddings aligned to candidate texts (deep path). */
  embeddingBoost?: {
    byText: Map<string, Float32Array>;
    topic: Float32Array | null;
    neural: boolean;
  };
  /** Optional sentiment intensity by candidate text. */
  sentimentByText?: Map<string, number>;
};

export type ShortsCandidate = ClipCandidate & {
  quote: string;
  title?: string;
};

/**
 * Transcript-first shorts ranking (sync).
 * Embeddings / neural sentiment are optional boosts when provided by deepAnalyze.
 */
export function findShortsMoments(input: ShortsBrainInput): ShortsCandidate[] {
  const utterances = buildUtterances(input.transcript);
  if (utterances.length < 2) return [];

  const seeds = seedStartsFromUtterances(
    utterances,
    input.durationMs,
    input.lengthMs,
  );

  const scored: ShortsCandidate[] = [];

  for (const seed of seeds) {
    let start = seed.startMs;
    let end = snapEndToPayoff(
      utterances,
      start,
      input.lengthMs,
      input.durationMs,
    );
    if (end - start < input.lengthMs * 0.8) continue;

    // Anaphora: extend backward or penalize mid-thought opens
    const ana = resolveAnaphora({
      utterances,
      startMs: start,
      endMs: end,
      lengthMs: input.lengthMs,
      durationMs: input.durationMs,
    });
    start = ana.startMs;
    end = ana.endMs;

    const inWin = utterancesInWindow(utterances, start, end);
    const text = textInWindow(utterances, start, end);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) continue;

    const hookText = textInWindow(utterances, start, start + 3500);
    const openUtt = inWin.find((u) => u.startMs <= start + 800) ?? inWin[0];
    const closeUtt = inWin[inWin.length - 1];

    const hook = Math.max(
      hookStrength(hookText),
      openUtt ? hookStrength(openUtt.text) : 0,
      seed.kind === "hook" ? 0.35 : 0,
    );

    const openClean =
      openUtt && Math.abs(openUtt.startMs - start) < 700 ? 0.2 : 0;

    const fill = fillerRatio(text);
    const density = Math.min(
      1,
      contentWordCount(text) / Math.max(12, wordCount * 0.35),
    );
    const substance = Math.max(0, density * (1 - fill * 1.1));

    const endText = textInWindow(
      utterances,
      Math.max(start, end - 3500),
      end,
    );
    const payoff =
      (endsWithPunch(endText) || endsWithPunch(closeUtt?.text ?? "")
        ? 0.7
        : 0.2) + (seed.kind === "payoff" ? 0.15 : 0);

    const beats = Math.min(1, inWin.length / 4);
    const arc = hook * 0.35 + payoff * 0.4 + beats * 0.25;

    const andThen = (text.match(/\b(and then|and uh|so yeah)\b/gi) ?? [])
      .length;
    let standalone = Math.max(0, substance - andThen * 0.08);

    const sent =
      input.sentimentByText?.get(text) ??
      heuristicSentiment(hookText || text).intensity;

    const energy = sceneEnergy(input.scenes ?? [], start, end) * 0.06;

    let total =
      hook * 0.3 +
      substance * 0.18 +
      arc * 0.2 +
      payoff * 0.1 +
      standalone * 0.1 +
      sent * 0.12 +
      openClean +
      energy;

    total *= 1 - ana.penalty;

    if (hook < 0.25 && payoff < 0.45) total *= 0.55;
    if (fill > 0.25) total *= 0.7;

    if (
      /\b(thanks for watching|smash like|subscribe|like and subscribe|comment below|link in bio|see you next)\b/i.test(
        text,
      )
    ) {
      total *= 0.15;
    }
    if (/^(um|uh|so yeah|anyway|okay so)\b/i.test(hookText.trim())) {
      total *= 0.45;
    }

    const quote = quoteFromWindow(utterances, start, end);
    if (!quote || quote.split(/\s+/).length < 3) continue;

    const reason = templateReason({
      hookText: hookText || quote,
      payoff: payoff >= 0.5,
      substance: substance >= 0.5,
    });
    if (ana.extended) {
      // keep reason honest about the fix
    }

    scored.push({
      id: `${start}-${end}`,
      startMs: start,
      endMs: end,
      score: round4(total),
      reason,
      quote,
      title: templateTitle(quote),
      cropNorm: fitCropOnly(input.upright),
      scores: {
        hook: round4(Math.min(1, hook + sent * 0.2)),
        clarity: round4(substance),
        context: round4(arc),
        face: 0,
        ending: round4(payoff),
      },
    });
  }

  // Semantic novelty (embeddings) or Jaccard fallback
  scored.sort((a, b) => b.score - a.score);
  const noveltyAdjusted = applyNovelty(scored, input.embeddingBoost);

  noveltyAdjusted.sort((a, b) => b.score - a.score);

  // Boost standalone-ness from topic centroid when available
  if (input.embeddingBoost?.topic) {
    const keptVecs: Float32Array[] = [];
    for (const c of noveltyAdjusted) {
      const vec =
        input.embeddingBoost.byText.get(c.quote) ?? hashEmbed(c.quote);
      const stand = standaloneScore(
        vec,
        input.embeddingBoost.topic,
        keptVecs,
      );
      c.score = round4(c.score * (0.75 + stand * 0.35));
      keptVecs.push(vec);
    }
    noveltyAdjusted.sort((a, b) => b.score - a.score);
  }

  const minKeep = Math.max(0.28, (noveltyAdjusted[0]?.score ?? 0) * 0.45);
  const viable = noveltyAdjusted.filter((c) => c.score >= minKeep);
  const pool = viable.length >= input.topK ? viable : noveltyAdjusted;

  return pickDiverse(pool, input.topK, {
    durationMs: input.durationMs,
    lengthMs: input.lengthMs,
  });
}

function applyNovelty(
  scored: ShortsCandidate[],
  boost?: ShortsBrainInput["embeddingBoost"],
): ShortsCandidate[] {
  const out: ShortsCandidate[] = [];
  for (const c of scored) {
    let maxSim = 0;
    if (boost?.byText.size) {
      const vec = boost.byText.get(c.quote) ?? hashEmbed(c.quote);
      for (const kept of out.slice(0, 16)) {
        const kv = boost.byText.get(kept.quote) ?? hashEmbed(kept.quote);
        maxSim = Math.max(maxSim, cosineSimilarity(vec, kv));
      }
    } else {
      const set = wordSetLocal(c.quote);
      for (const kept of out.slice(0, 16)) {
        maxSim = Math.max(maxSim, jaccardLocal(set, wordSetLocal(kept.quote)));
      }
    }
    out.push({
      ...c,
      score: round4(c.score * (1 - maxSim * 0.55)),
    });
  }
  return out;
}

/** Build embedding boost maps from an EmbeddingResult + quote list. */
export function buildEmbeddingBoost(
  quotes: string[],
  emb: EmbeddingResult,
): ShortsBrainInput["embeddingBoost"] {
  const byText = new Map<string, Float32Array>();
  quotes.forEach((q, i) => {
    if (emb.vectors[i]) byText.set(q, emb.vectors[i]);
  });
  return {
    byText,
    topic: centroid(emb.vectors),
    neural: emb.neural,
  };
}

function sceneEnergy(
  scenes: SceneCut[],
  startMs: number,
  endMs: number,
): number {
  const cuts = scenes.filter((s) => s.tMs > startMs && s.tMs < endMs);
  return Math.min(1, cuts.length / 4);
}

function fitCropOnly(upright: { w: number; h: number }): Box {
  const ar = upright.w / upright.h;
  if (ar <= 9 / 16 + 0.03) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  return centerCrop9x16(upright);
}

function wordSetLocal(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccardLocal(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
