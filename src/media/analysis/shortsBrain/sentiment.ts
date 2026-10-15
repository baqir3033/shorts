/**
 * Sentiment / emphasis scoring for hooks + caption word flags.
 * Neural path via DistilBERT SST-2; heuristic fallback always available.
 */

const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifier: any = null;
let loading: Promise<unknown> | null = null;

const EMPHASIS_WORDS =
  /\b(never|always|actually|secret|mistake|truth|crazy|insane|worst|best|stop|don'?t|must|critical|warning|shocking|huge|massive)\b/i;

export type SentimentScore = {
  /** 0–1 emotional intensity / opinion strength */
  intensity: number;
  label?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  neural: boolean;
};

export type EmphasizedWord = {
  text: string;
  startMs: number;
  endMs: number;
  emphasis: boolean;
};

/** Sync heuristic — used in unit tests and as model fallback. */
export function heuristicSentiment(text: string): SentimentScore {
  if (!text.trim()) return { intensity: 0, label: "NEUTRAL", neural: false };
  let intensity = 0;
  if (/[!]{1,}/.test(text)) intensity += 0.25;
  if (/\?/.test(text)) intensity += 0.15;
  if (/[A-Z]{3,}/.test(text)) intensity += 0.2;
  if (EMPHASIS_WORDS.test(text)) intensity += 0.35;
  const bangs = (text.match(/!/g) ?? []).length;
  intensity += Math.min(0.2, bangs * 0.08);
  return {
    intensity: Math.min(1, intensity),
    label: intensity >= 0.45 ? "POSITIVE" : "NEUTRAL",
    neural: false,
  };
}

export async function scoreSentiment(
  text: string,
  opts?: { safariMode?: boolean; signal?: AbortSignal },
): Promise<SentimentScore> {
  const fallback = heuristicSentiment(text);
  if (opts?.safariMode || !text.trim()) {
    return fallback;
  }
  try {
    if (opts?.signal?.aborted) throw new Error("aborted");
    const pipe = await getClassifier();
    const out = await pipe(text.slice(0, 512));
    const row = Array.isArray(out) ? out[0] : out;
    const label = String(row?.label ?? "NEUTRAL").toUpperCase() as
      | "POSITIVE"
      | "NEGATIVE"
      | "NEUTRAL";
    const score = typeof row?.score === "number" ? row.score : 0.5;
    // Strong polarity (either direction) = emotional intensity for shorts
    const polarity = label === "NEUTRAL" ? 0.3 : score;
    const intensity = Math.min(
      1,
      polarity * 0.7 + fallback.intensity * 0.4,
    );
    return { intensity, label, neural: true };
  } catch {
    return { ...fallback, neural: false };
  }
}

/** Flag words that should render larger/accented in captions. */
export function flagEmphasisWords(
  words: { text: string; startMs: number; endMs: number }[],
): EmphasizedWord[] {
  return words.map((w) => ({
    ...w,
    emphasis:
      EMPHASIS_WORDS.test(w.text) ||
      (w.text.length > 2 && w.text === w.text.toUpperCase() && /[A-Z]/.test(w.text)),
  }));
}

async function getClassifier() {
  if (classifier) return classifier;
  if (loading) {
    await loading;
    return classifier;
  }
  loading = (async () => {
    const mod = await (Function(
      "u",
      "return import(/* webpackIgnore: true */ u)",
    )(TRANSFORMERS_CDN) as Promise<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipeline: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: any;
    }>);
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    classifier = await mod.pipeline(
      "sentiment-analysis",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
      { dtype: "q8" },
    );
  })();
  try {
    await loading;
    return classifier;
  } finally {
    loading = null;
  }
}
