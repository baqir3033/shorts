import type { TextOverlay } from "@/media/edit-spec/types";
import { CAPTION_FONT_MEMFS } from "./captionBurn";

function esc(text: string): string {
  return text
    .replace(/\\/g, "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "")
    .replace(/%/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .slice(0, 80);
}

function sec(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

export function buildTextOverlayBurn(
  overlays: TextOverlay[],
  vinLabel: string,
  /** Map clip-relative source ms → output ms */
  mapTime: (clipRelMs: number) => number,
  fontfile: string = CAPTION_FONT_MEMFS,
): { chain: string; outLabel: string } {
  if (!overlays.length) return { chain: "", outLabel: vinLabel };

  const font = `fontfile=${fontfile}`;
  const filters: string[] = [];
  let prev = vinLabel;
  let idx = 0;

  for (const o of overlays) {
    const text = esc(o.text);
    if (!text) continue;
    const start = sec(mapTime(o.startMs));
    const end = sec(mapTime(o.endMs));
    const xExpr = `(w*${o.positionNorm.x.toFixed(3)})-(text_w/2)`;
    const yBase = `h*${o.positionNorm.y.toFixed(3)}`;
    const yExpr =
      o.animation === "slide_up"
        ? `${yBase}-20+20*min(1\\,(t-${start})/0.25)`
        : yBase;
    const enable = `between(t\\,${start}\\,${end})`;
    const label = `tx${idx}`;
    const color = o.color.startsWith("#")
      ? `0x${o.color.slice(1)}`
      : o.color.replace("#", "0x");
    filters.push(
      `[${prev}]drawtext=${font}:text='${text}':fontsize=${o.fontSize}:fontcolor=${color}:borderw=3:bordercolor=black:x=${xExpr}:y=${yExpr}:enable='${enable}'[${label}]`,
    );
    prev = label;
    idx++;
  }

  return {
    chain: filters.join(";"),
    outLabel: prev,
  };
}
