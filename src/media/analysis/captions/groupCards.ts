import type { TimedWord } from "@/media/edit-spec/types";

export type CaptionCard = {
  id: string;
  startMs: number;
  endMs: number;
  words: (TimedWord & { emphasis?: boolean })[];
  text: string;
};

/**
 * Group timed words into 2–4 word karaoke cards at pause / punctuation boundaries.
 * Times are expected clip-relative (0 at clip start).
 */
export function groupWordsIntoCards(
  words: (TimedWord & { emphasis?: boolean })[],
  opts?: { minWords?: number; maxWords?: number },
): CaptionCard[] {
  const minW = opts?.minWords ?? 2;
  const maxW = opts?.maxWords ?? 4;
  if (!words.length) return [];

  const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
  const cards: CaptionCard[] = [];
  let buf: typeof sorted = [];

  const flush = () => {
    if (!buf.length) return;
    const startMs = buf[0].startMs;
    const endMs = buf[buf.length - 1].endMs;
    cards.push({
      id: `cap-${startMs}-${endMs}-${cards.length}`,
      startMs,
      endMs: Math.max(endMs, startMs + 80),
      words: buf.map((w) => ({ ...w })),
      text: buf.map((w) => w.text).join(" "),
    });
    buf = [];
  };

  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i];
    const prev = buf[buf.length - 1];
    const gap = prev ? w.startMs - prev.endMs : 0;
    const punctEnd = prev ? /[.!?,;:]$/.test(prev.text) : false;

    if (buf.length >= maxW || (buf.length >= minW && (gap > 350 || punctEnd))) {
      flush();
    }
    buf.push(w);
  }
  flush();

  // Merge singleton leftovers into previous card when possible
  const merged: CaptionCard[] = [];
  for (const c of cards) {
    if (
      c.words.length === 1 &&
      merged.length &&
      merged[merged.length - 1].words.length < maxW
    ) {
      const last = merged[merged.length - 1];
      last.words.push(...c.words);
      last.endMs = c.endMs;
      last.text = last.words.map((w) => w.text).join(" ");
    } else {
      merged.push(c);
    }
  }
  return merged;
}

/** Slice absolute-time transcript words into clip-relative TimedWords. */
export function sliceWordsToClip(
  words: TimedWord[] | undefined,
  clipStartMs: number,
  clipEndMs: number,
): TimedWord[] {
  if (!words?.length) return [];
  return words
    .filter((w) => w.endMs > clipStartMs && w.startMs < clipEndMs)
    .map((w) => ({
      text: w.text,
      startMs: Math.max(0, w.startMs - clipStartMs),
      endMs: Math.max(40, w.endMs - clipStartMs),
    }))
    .filter((w) => w.endMs > w.startMs);
}
