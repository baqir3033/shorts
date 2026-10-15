import { OUTPUT_HEIGHT, OUTPUT_WIDTH, PIP_SIZE_MAX, PIP_SIZE_MIN } from "@/lib/constants";
import type { Box, LayoutSpec } from "@/media/edit-spec/types";
import type { ProbeResult } from "@/media/ingest/types";

export type PixelRect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export function uprightSize(
  probe: Pick<ProbeResult, "width" | "height" | "rotation">,
): Size {
  if (probe.rotation === 90 || probe.rotation === 270) {
    return { w: probe.height, h: probe.width };
  }
  return { w: probe.width, h: probe.height };
}

export function cropNormToPixels(box: Box, upright: Size): PixelRect {
  const x = Math.round(clamp01(box.x) * upright.w);
  const y = Math.round(clamp01(box.y) * upright.h);
  let w = Math.round(clamp01(box.w) * upright.w);
  let h = Math.round(clamp01(box.h) * upright.h);
  w = Math.max(1, Math.min(w, upright.w - x));
  h = Math.max(1, Math.min(h, upright.h - y));
  return { x, y, w, h };
}

/**
 * Remainder pixels go to the primary pane so widths/heights always sum exactly.
 */
export function splitVerticalRects(
  output: Size,
  primaryRatio: number,
): { primary: PixelRect; secondary: PixelRect } {
  const ratio = clamp(primaryRatio, 0.3, 0.7);
  const primaryW = Math.round(output.w * ratio);
  const secondaryW = output.w - primaryW;
  return {
    primary: { x: 0, y: 0, w: primaryW, h: output.h },
    secondary: { x: primaryW, y: 0, w: secondaryW, h: output.h },
  };
}

export function splitHorizontalRects(
  output: Size,
  primaryRatio: number,
  primaryOn: "top" | "bottom",
): { primary: PixelRect; secondary: PixelRect } {
  const ratio = clamp(primaryRatio, 0.3, 0.7);
  const primaryH = Math.round(output.h * ratio);
  const secondaryH = output.h - primaryH;
  if (primaryOn === "top") {
    return {
      primary: { x: 0, y: 0, w: output.w, h: primaryH },
      secondary: { x: 0, y: primaryH, w: output.w, h: secondaryH },
    };
  }
  return {
    primary: { x: 0, y: secondaryH, w: output.w, h: primaryH },
    secondary: { x: 0, y: 0, w: output.w, h: secondaryH },
  };
}

export function pipRect(
  output: Size,
  anchor: "tl" | "tr" | "bl" | "br",
  sizePercent: number,
  marginPx: number,
): PixelRect {
  const pct = clamp(sizePercent, PIP_SIZE_MIN, PIP_SIZE_MAX);
  const h = Math.max(1, Math.round((output.h * pct) / 100));
  // Keep 9:16-ish reaction window (portrait pip)
  const w = Math.max(1, Math.round((h * 9) / 16));
  const m = Math.max(0, Math.round(marginPx));
  let x = m;
  let y = m;
  if (anchor === "tr" || anchor === "br") x = output.w - w - m;
  if (anchor === "bl" || anchor === "br") y = output.h - h - m;
  x = clamp(x, 0, Math.max(0, output.w - w));
  y = clamp(y, 0, Math.max(0, output.h - h));
  return { x, y, w, h };
}

export function layoutPanes(
  layout: LayoutSpec,
  output: Size = { w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT },
): {
  primary?: PixelRect;
  secondary?: PixelRect;
  full?: PixelRect;
  overlay?: PixelRect;
} {
  if (layout.type === "split_vertical") {
    const { primary, secondary } = splitVerticalRects(
      output,
      layout.primaryRatio,
    );
    return { primary, secondary };
  }
  if (layout.type === "split_horizontal") {
    const { primary, secondary } = splitHorizontalRects(
      output,
      layout.primaryRatio,
      layout.primaryOn,
    );
    return { primary, secondary };
  }
  return {
    full: { x: 0, y: 0, w: output.w, h: output.h },
    overlay: pipRect(
      output,
      layout.anchor,
      layout.sizePercent,
      layout.marginPx,
    ),
  };
}

/** Build a 9:16 (portrait) crop centered on a face (or frame center). */
export function suggestCrop9x16(
  upright: Size,
  face?: Box | null,
  padding = 1.4,
): Box {
  const targetAR = 9 / 16; // width / height
  let cx = upright.w / 2;
  let cy = upright.h / 2;
  let desiredH = upright.h;

  if (face) {
    cx = (face.x + face.w / 2) * upright.w;
    cy = (face.y + face.h / 2) * upright.h;
    desiredH = Math.min(upright.h, face.h * upright.h * padding);
  }

  // Fit largest 9:16 rect inside upright
  let cropH = Math.min(desiredH, upright.h);
  let cropW = cropH * targetAR;
  if (cropW > upright.w) {
    cropW = upright.w;
    cropH = cropW / targetAR;
  }

  let x = cx - cropW / 2;
  let y = cy - cropH / 2;
  x = clamp(x, 0, upright.w - cropW);
  y = clamp(y, 0, upright.h - cropH);

  return {
    x: x / upright.w,
    y: y / upright.h,
    w: cropW / upright.w,
    h: cropH / upright.h,
  };
}

export function centerCrop9x16(upright: Size): Box {
  return suggestCrop9x16(upright, null);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
