import type { CaptionStyleId, TimedWord } from "@/media/edit-spec/types";
import { groupWordsIntoCards } from "@/media/analysis/captions/groupCards";

const MAX_WORDS = 72;

/** Filename written into ffmpeg MEMFS by encode.ts */
export const CAPTION_FONT_MEMFS = "caption.ttf";
/** Served from public/fonts — must be a real TTF (ffmpeg.wasm drawtext requires fontfile). */
export const CAPTION_FONT_PUBLIC = "/fonts/caption.ttf";

function esc(text: string): string {
  return text
    .replace(/\\/g, "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "")
    .replace(/%/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .slice(0, 40);
}

function sec(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

export type CaptionBurnResult = {
  /** filter chain segment starting from [vin] ending as [vout] */
  chain: string;
  outLabel: string;
};

/**
 * Build karaoke drawtext chains for 3 caption styles.
 * Requires `fontfile` path inside ffmpeg FS (see CAPTION_FONT_MEMFS).
 */
export function buildCaptionBurn(
  words: TimedWord[],
  styleId: CaptionStyleId,
  vinLabel = "vout",
  fontfile: string = CAPTION_FONT_MEMFS,
): CaptionBurnResult {
  const limited = words.slice(0, MAX_WORDS);
  if (!limited.length) {
    return { chain: "", outLabel: vinLabel };
  }

  const font = `fontfile=${fontfile}`;
  const cards = groupWordsIntoCards(limited);
  const filters: string[] = [];
  let prev = vinLabel;
  let idx = 0;

  for (const card of cards) {
    const cardText = esc(card.text);
    if (!cardText) continue;
    const cardStart = sec(card.startMs);
    const cardEnd = sec(card.endMs);
    const dimColor =
      styleId === "bold-yellow-black" ? "0xCCCCCC" : "0xDDDDDD";
    const baseSize = styleId === "word-by-word-pop" ? 52 : 56;
    const yExpr = "h*0.78";

    const dimLabel = `capd${idx}`;
    filters.push(
      `[${prev}]drawtext=${font}:text='${cardText}':fontsize=${baseSize}:fontcolor=${dimColor}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${yExpr}:enable='between(t\\,${cardStart}\\,${cardEnd})'[${dimLabel}]`,
    );
    prev = dimLabel;

    for (const w of card.words) {
      const wt = esc(w.text);
      if (!wt) continue;
      const ws = sec(w.startMs);
      const we = sec(Math.max(w.endMs, w.startMs + 80));
      const hiLabel = `caph${idx}`;
      const emph = !!w.emphasis;
      const hiSize = emph
        ? styleId === "word-by-word-pop"
          ? 72
          : 68
        : styleId === "word-by-word-pop"
          ? 64
          : 60;
      const hiColor =
        styleId === "bold-yellow-black"
          ? "yellow"
          : emph
            ? "0xFFCC00"
            : "white";
      const box =
        styleId === "bold-yellow-black"
          ? `:box=1:boxcolor=black@0.75:boxborderw=12`
          : "";

      filters.push(
        `[${prev}]drawtext=${font}:text='${wt}':fontsize=${hiSize}:fontcolor=${hiColor}:borderw=4:bordercolor=black${box}:x=(w-text_w)/2:y=${yExpr}:enable='between(t\\,${ws}\\,${we})'[${hiLabel}]`,
      );
      prev = hiLabel;
      idx++;
    }
    idx++;
  }

  return {
    chain: filters.join(";"),
    outLabel: prev,
  };
}
