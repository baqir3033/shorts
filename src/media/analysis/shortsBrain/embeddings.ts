/**
 * Sentence embeddings for semantic novelty + standalone scoring.
 * Model loads lazily via Transformers.js CDN; falls back to bag-of-words vectors.
 */

const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null;
let loading: Promise<unknown> | null = null;

export type EmbeddingResult = {
  vectors: Float32Array[];
  /** true when real MiniLM loaded; false = bag-of-words fallback */
  neural: boolean;
  degradations: string[];
};

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function centroid(vectors: Float32Array[]): Float32Array | null {
  if (!vectors.length) return null;
  const dim = vectors[0].length;
  const out = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/** Bag-of-words hashed embedding — sync fallback when neural model unavailable. */
export function hashEmbed(text: string, dim = 64): Float32Array {
  const v = new Float32Array(dim);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!tokens.length) return v;
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    v[idx] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

export async function embedTexts(
  texts: string[],
  opts?: { safariMode?: boolean; signal?: AbortSignal },
): Promise<EmbeddingResult> {
  const degradations: string[] = [];
  if (!texts.length) {
    return { vectors: [], neural: false, degradations };
  }

  if (opts?.safariMode) {
    degradations.push("embeddings_skipped_safari");
    return {
      vectors: texts.map((t) => hashEmbed(t)),
      neural: false,
      degradations,
    };
  }

  try {
    if (opts?.signal?.aborted) throw new Error("aborted");
    const pipe = await getEmbedder();
    const vectors: Float32Array[] = [];
    for (const text of texts) {
      if (opts?.signal?.aborted) throw new Error("aborted");
      const out = await pipe(text, { pooling: "mean", normalize: true });
      const data =
        out?.data ??
        out?.[0]?.data ??
        (Array.isArray(out) ? out : null);
      if (data && typeof data.length === "number") {
        vectors.push(Float32Array.from(data as ArrayLike<number>));
      } else {
        vectors.push(hashEmbed(text));
      }
    }
    return { vectors, neural: true, degradations };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("memory") || msg.includes("OOM")) {
      degradations.push("embeddings_oom");
    } else {
      degradations.push("embeddings_unavailable");
    }
    return {
      vectors: texts.map((t) => hashEmbed(t)),
      neural: false,
      degradations,
    };
  }
}

async function getEmbedder() {
  if (embedder) return embedder;
  if (loading) {
    await loading;
    return embedder;
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
    embedder = await mod.pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    );
  })();
  try {
    await loading;
    return embedder;
  } finally {
    loading = null;
  }
}

/**
 * Standalone-ness: how self-contained a clip is vs the whole-video topic.
 * High = distinctive / complete idea; low = generic or needs surrounding context.
 */
export function standaloneScore(
  clipVec: Float32Array,
  topicCentroid: Float32Array | null,
  neighbors: Float32Array[],
): number {
  if (!topicCentroid) return 0.5;
  // Slight distance from global topic = more specific take (good)
  const toTopic = cosineSimilarity(clipVec, topicCentroid);
  // Not too similar to neighbors already kept
  let maxNeighbor = 0;
  for (const n of neighbors) {
    maxNeighbor = Math.max(maxNeighbor, cosineSimilarity(clipVec, n));
  }
  // Prefer moderately related to topic (0.3–0.7) over identical or orthogonal
  const topicFit = 1 - Math.abs(toTopic - 0.45);
  return Math.max(0, Math.min(1, topicFit * 0.7 + (1 - maxNeighbor) * 0.3));
}
