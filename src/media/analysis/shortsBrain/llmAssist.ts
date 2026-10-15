/**
 * Optional tiny local LLM for punchy titles + natural-language reasons.
 * Skipped on safari / low-core devices; degrades to templated strings.
 */

const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let loading: Promise<unknown> | null = null;
let disabled = false;

export type LlmAssistResult = {
  title: string;
  reason: string;
  neural: boolean;
};

export function templateTitle(quote: string): string {
  const clean = quote.replace(/[""]/g, "").trim();
  if (!clean) return "Untitled short";
  const words = clean.split(/\s+/).slice(0, 8);
  let t = words.join(" ");
  if (t.length > 48) t = `${t.slice(0, 45).trim()}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function templateReason(parts: {
  hookText: string;
  payoff: boolean;
  substance: boolean;
}): string {
  const bits: string[] = [];
  if (parts.hookText) {
    const q =
      parts.hookText.length > 56
        ? `${parts.hookText.slice(0, 53).trim()}…`
        : parts.hookText;
    bits.push(`Hook: “${q}”`);
  }
  if (parts.payoff) bits.push("Lands a clear ending");
  if (parts.substance) bits.push("Self-contained take");
  return bits.slice(0, 3).join(" · ") || "Possible short moment";
}

export function shouldSkipLlm(opts?: {
  safariMode?: boolean;
  cores?: number;
}): boolean {
  if (disabled) return true;
  if (opts?.safariMode) return true;
  if ((opts?.cores ?? 8) <= 4) return true;
  return false;
}

export async function generateTitleAndReason(
  quote: string,
  fallbackReason: string,
  opts?: { safariMode?: boolean; cores?: number; signal?: AbortSignal },
): Promise<LlmAssistResult> {
  const title = templateTitle(quote);
  if (shouldSkipLlm(opts) || !quote.trim()) {
    return { title, reason: fallbackReason, neural: false };
  }

  try {
    if (opts?.signal?.aborted) throw new Error("aborted");
    const pipe = await getGenerator();
    const prompt =
      `Write a punchy 6-word YouTube Shorts title and one short reason ` +
      `why this clip works. Format:\nTITLE: ...\nREASON: ...\n\nQuote: "${quote.slice(0, 180)}"`;
    const out = await pipe(prompt, {
      max_new_tokens: 64,
      temperature: 0.4,
      do_sample: false,
    });
    const text = String(
      Array.isArray(out) ? out[0]?.generated_text ?? out[0] : out,
    );
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const reasonMatch = text.match(/REASON:\s*(.+)/i);
    const llmTitle = titleMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
    const llmReason = reasonMatch?.[1]?.trim();
    return {
      title: llmTitle && llmTitle.length >= 3 ? llmTitle.slice(0, 60) : title,
      reason:
        llmReason && llmReason.length >= 8
          ? llmReason.slice(0, 160)
          : fallbackReason,
      neural: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("memory") || msg.includes("OOM")) {
      disabled = true;
    }
    return { title, reason: fallbackReason, neural: false };
  }
}

async function getGenerator() {
  if (generator) return generator;
  if (loading) {
    await loading;
    return generator;
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
    // Small instruct model — may fail on low RAM; caller falls back
    generator = await mod.pipeline(
      "text-generation",
      "Xenova/Qwen2.5-0.5B-Instruct",
      { dtype: "q4" },
    );
  })();
  try {
    await loading;
    return generator;
  } finally {
    loading = null;
  }
}
