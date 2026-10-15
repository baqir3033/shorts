import type { TimedWord } from "@/media/edit-spec/types";

export type Utterance = {
  startMs: number;
  endMs: number;
  text: string;
};

/** Strong short-form openers / conflict / curiosity. */
const HOOK_RE =
  /\b(wait|but|actually|never|nobody|secret|mistake|stop|don'?t|here'?s|why|how|what if|listen|look|crazy|insane|truth|wrong|biggest|worst|best|hack|tip|warning|imagine|plot twist|instead|forget|avoid|always|finally)\b/i;

const IMPERATIVE_RE =
  /\b(stop|don'?t|do this|try this|watch this|listen|look|forget|avoid|start|quit|never)\b/i;

const PAYOFF_RE =
  /\b(that'?s why|so |therefore|the point|in short|bottom line|result|because|which means|and that'?s|here'?s the thing)\b/i;

const FILLER = /\b(um+|uh+|erm+|like|you know|sort of|kind of|basically|literally|right\?)\b/gi;

const CONTENT_STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "you",
  "your",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "from",
  "they",
  "them",
  "then",
  "than",
  "into",
  "just",
  "about",
  "when",
  "what",
  "which",
  "will",
  "would",
  "could",
  "should",
  "there",
  "their",
  "been",
  "being",
  "some",
  "very",
  "also",
  "only",
  "over",
  "such",
  "our",
]);

/** Build pause / punctuation-bounded utterances from words or segments. */
export function buildUtterances(input: {
  segments?: { startMs: number; endMs: number; text: string }[];
  words?: TimedWord[];
}): Utterance[] {
  const words = input.words ?? [];
  if (words.length >= 8) {
    const out: Utterance[] = [];
    let buf: TimedWord[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (buf.length === 0) {
        buf.push(w);
        continue;
      }
      const gap = w.startMs - buf[buf.length - 1].endMs;
      const prevText = buf[buf.length - 1].text;
      const boundary =
        gap > 350 || /[.!?]$/.test(prevText) || buf.length >= 20;
      if (boundary) {
        out.push(flush(buf));
        buf = [w];
      } else {
        buf.push(w);
      }
    }
    if (buf.length) out.push(flush(buf));
    return out.filter((u) => u.text.trim().split(/\s+/).length >= 2);
  }

  // Segment-only: split on sentence punctuation so we get real idea beats
  const expanded: Utterance[] = [];
  for (const s of input.segments ?? []) {
    const parts = splitSentences(s.text);
    if (parts.length <= 1) {
      if (s.text.trim()) {
        expanded.push({
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text.trim(),
        });
      }
      continue;
    }
    const span = Math.max(1, s.endMs - s.startMs);
    let offset = 0;
    const totalChars = parts.reduce((n, p) => n + p.length, 0) || 1;
    for (const part of parts) {
      const frac = part.length / totalChars;
      const startMs = s.startMs + Math.round(offset * span);
      offset += frac;
      const endMs = s.startMs + Math.round(offset * span);
      if (part.trim()) {
        expanded.push({
          startMs,
          endMs: Math.max(endMs, startMs + 200),
          text: part.trim(),
        });
      }
    }
  }
  return expanded.filter((u) => u.text.split(/\s+/).length >= 2);
}

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function flush(words: TimedWord[]): Utterance {
  return {
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    text: words
      .map((w) => w.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

/**
 * Seed clip starts from idea anchors — hooks & payoffs — not a dumb time grid.
 */
export function seedStartsFromUtterances(
  utterances: Utterance[],
  durationMs: number,
  lengthMs: number,
): { startMs: number; kind: "hook" | "payoff" | "idea" }[] {
  const seeds: { startMs: number; kind: "hook" | "payoff" | "idea" }[] = [];
  const seen = new Set<number>();

  const add = (startMs: number, kind: "hook" | "payoff" | "idea") => {
    const s = Math.max(0, Math.min(startMs, Math.max(0, durationMs - lengthMs)));
    const key = Math.round(s / 250) * 250; // bucket near-duplicates
    if (seen.has(key)) return;
    if (s + lengthMs > durationMs + 400) return;
    seen.add(key);
    seeds.push({ startMs: s, kind });
  };

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const hookScore = hookStrength(u.text);

    // Start the short ON a hook line
    if (hookScore >= 0.45) {
      add(u.startMs, "hook");
    }

    // Payoff-aligned: end near this utterance, start lengthMs earlier
    if (endsWithPunch(u.text) || PAYOFF_RE.test(u.text) || hookScore >= 0.35) {
      add(u.endMs - lengthMs, "payoff");
    }

    // Idea start: beginning of a multi-utterance thought (after a pause/boundary)
    if (i === 0 || u.startMs - utterances[i - 1].endMs > 500) {
      if (contentWordCount(u.text) >= 3) add(u.startMs, "idea");
    }
  }

  // Sparse transcript only: light grid as last resort
  if (seeds.length < 4) {
    const step = Math.max(lengthMs * 0.9, 12_000);
    for (let t = 0; t + lengthMs <= durationMs; t += step) {
      add(Math.round(t), "idea");
    }
  }

  return seeds.sort((a, b) => a.startMs - b.startMs);
}

export function textInWindow(
  utterances: Utterance[],
  startMs: number,
  endMs: number,
): string {
  return utterances
    .filter((u) => u.endMs > startMs + 80 && u.startMs < endMs - 80)
    .map((u) => u.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function utterancesInWindow(
  utterances: Utterance[],
  startMs: number,
  endMs: number,
): Utterance[] {
  return utterances.filter(
    (u) => u.endMs > startMs + 80 && u.startMs < endMs - 80,
  );
}

export function quoteFromWindow(
  utterances: Utterance[],
  startMs: number,
  endMs: number,
  maxChars = 100,
): string {
  const inWin = utterancesInWindow(utterances, startMs, endMs);
  // Prefer the strongest hook line in the first 4s
  const early = inWin.filter((u) => u.startMs < startMs + 4000);
  let best = early[0]?.text ?? inWin[0]?.text ?? "";
  let bestScore = -1;
  for (const u of early.length ? early : inWin) {
    const s = hookStrength(u.text);
    if (s > bestScore) {
      bestScore = s;
      best = u.text;
    }
  }
  if (!best) return "";
  if (best.length <= maxChars) return best;
  return `${best.slice(0, maxChars - 1).trim()}…`;
}

export function hookStrength(text: string): number {
  if (!text) return 0;
  let s = 0;
  if (text.includes("?")) s += 0.45;
  if (HOOK_RE.test(text)) s += 0.4;
  if (IMPERATIVE_RE.test(text)) s += 0.25;
  if (/^(so|and|um|uh)\b/i.test(text.trim())) s -= 0.2;
  return Math.max(0, Math.min(1, s));
}

export function hasHookPattern(text: string): boolean {
  return hookStrength(text) >= 0.4;
}

export function fillerRatio(text: string): number {
  if (!text) return 1;
  const fillers = text.match(FILLER);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 1;
  return Math.min(1, (fillers?.length ?? 0) / words);
}

export function endsWithPunch(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[.!?]"?\s*$/.test(t)) return true;
  return PAYOFF_RE.test(t);
}

export function contentWordCount(text: string): number {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !CONTENT_STOP.has(w)).length;
}

export function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !CONTENT_STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Snap window end to nearest sentence/utterance end in the last 20% of the clip. */
export function snapEndToPayoff(
  utterances: Utterance[],
  startMs: number,
  lengthMs: number,
  durationMs: number,
): number {
  const rawEnd = Math.min(durationMs, startMs + lengthMs);
  const windowStart = startMs + lengthMs * 0.75;
  const candidates = utterances.filter(
    (u) => u.endMs >= windowStart && u.endMs <= rawEnd + 800,
  );
  if (!candidates.length) return rawEnd;

  let best = rawEnd;
  let bestScore = -1;
  for (const u of candidates) {
    let s = endsWithPunch(u.text) ? 2 : 0.5;
    s += hookStrength(u.text) * 0.3;
    // Prefer closer to natural length
    s -= Math.abs(u.endMs - rawEnd) / lengthMs;
    if (s > bestScore) {
      bestScore = s;
      best = Math.min(durationMs, Math.max(startMs + lengthMs * 0.85, u.endMs + 200));
    }
  }
  // Keep duration roughly user-chosen (±15%)
  const dur = best - startMs;
  if (dur < lengthMs * 0.85) return Math.min(durationMs, startMs + lengthMs);
  if (dur > lengthMs * 1.15) return Math.min(durationMs, startMs + lengthMs);
  return best;
}
