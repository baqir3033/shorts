import type { Utterance } from "./momentFinders";

/** Openers that usually need prior context. */
const UNRESOLVED_OPEN =
  /^(so|and so|and then|because|because of that|that'?s why|this|that|it|they|them|those|these|he|she|we)\b/i;

const ANTECEDENT_NOUN =
  /\b([A-Z][a-z]+|[a-z]{4,}(?:tion|ness|ment|ity|ers?|ings?))\b/;

export type AnaphoraFix = {
  startMs: number;
  endMs: number;
  /** 0–1 penalty applied if still unresolved after extend attempt */
  penalty: number;
  extended: boolean;
  unresolved: boolean;
};

/**
 * If the clip opens mid-thought (unresolved pronoun/reference), try extending
 * the window backward to capture an antecedent utterance. Otherwise penalize.
 */
export function resolveAnaphora(opts: {
  utterances: Utterance[];
  startMs: number;
  endMs: number;
  lengthMs: number;
  durationMs: number;
}): AnaphoraFix {
  const { utterances, endMs, lengthMs, durationMs } = opts;
  let startMs = opts.startMs;

  const open = utterances.find(
    (u) => u.endMs > startMs + 50 && u.startMs < startMs + 2500,
  );
  if (!open) {
    return { startMs, endMs, penalty: 0, extended: false, unresolved: false };
  }

  const needsContext = UNRESOLVED_OPEN.test(open.text.trim());
  if (!needsContext) {
    return { startMs, endMs, penalty: 0, extended: false, unresolved: false };
  }

  // Look backward for an antecedent within ~8s
  const lookBack = utterances
    .filter((u) => u.endMs <= open.startMs && u.endMs >= open.startMs - 8000)
    .sort((a, b) => b.endMs - a.endMs);

  let extended = false;
  for (const prev of lookBack) {
    if (ANTECEDENT_NOUN.test(prev.text) || /[.!?]$/.test(prev.text.trim())) {
      const newStart = Math.max(0, prev.startMs);
      const newEnd = Math.min(durationMs, newStart + lengthMs);
      // Keep roughly user-chosen length
      if (newEnd - newStart >= lengthMs * 0.85) {
        startMs = newStart;
        extended = true;
        break;
      }
    }
  }

  // Re-check open after extend
  const newOpen = utterances.find(
    (u) => u.endMs > startMs + 50 && u.startMs < startMs + 2500,
  );
  const stillUnresolved =
    !!newOpen && UNRESOLVED_OPEN.test(newOpen.text.trim()) && !hasLocalAntecedent(
      newOpen.text,
      utterances,
      startMs,
      Math.min(endMs, startMs + lengthMs),
    );

  return {
    startMs,
    endMs: extended
      ? Math.min(durationMs, startMs + lengthMs)
      : endMs,
    penalty: stillUnresolved ? 0.45 : extended ? 0.05 : 0,
    extended,
    unresolved: stillUnresolved,
  };
}

function hasLocalAntecedent(
  openText: string,
  utterances: Utterance[],
  startMs: number,
  endMs: number,
): boolean {
  const rest = utterances
    .filter((u) => u.startMs > startMs + 400 && u.startMs < endMs)
    .map((u) => u.text)
    .join(" ");
  // If the window itself defines the referent later, still weak for a short open —
  // only count as resolved if open itself has a noun after the pronoun.
  void rest;
  return ANTECEDENT_NOUN.test(openText.replace(UNRESOLVED_OPEN, ""));
}
