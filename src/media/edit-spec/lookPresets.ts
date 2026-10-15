export type LookPresetId =
  | "none"
  | "vivid"
  | "warm"
  | "cool"
  | "cinema"
  | "soft"
  | "noir"
  | "fade_film";

export type LookKnobs = {
  preset: LookPresetId;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  vignette: number;
  sharpen: number;
};

export const LOOK_PRESET_IDS: LookPresetId[] = [
  "none",
  "vivid",
  "warm",
  "cool",
  "cinema",
  "soft",
  "noir",
  "fade_film",
];

const IDENTITY: Omit<LookKnobs, "preset"> = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  vignette: 0,
  sharpen: 0,
};

const PRESET_DEFAULTS: Record<LookPresetId, Omit<LookKnobs, "preset">> = {
  none: { ...IDENTITY },
  vivid: {
    brightness: 0.05,
    contrast: 1.2,
    saturation: 1.35,
    temperature: 0.05,
    vignette: 0.15,
    sharpen: 0.35,
  },
  warm: {
    brightness: 0.04,
    contrast: 1.05,
    saturation: 1.1,
    temperature: 0.55,
    vignette: 0.1,
    sharpen: 0.1,
  },
  cool: {
    brightness: 0.02,
    contrast: 1.1,
    saturation: 0.95,
    temperature: -0.45,
    vignette: 0.08,
    sharpen: 0.2,
  },
  cinema: {
    brightness: -0.05,
    contrast: 1.25,
    saturation: 0.9,
    temperature: -0.15,
    vignette: 0.45,
    sharpen: 0.25,
  },
  soft: {
    brightness: 0.08,
    contrast: 0.9,
    saturation: 1.05,
    temperature: 0.15,
    vignette: 0.05,
    sharpen: 0,
  },
  noir: {
    brightness: 0,
    contrast: 1.35,
    saturation: 0,
    temperature: 0,
    vignette: 0.35,
    sharpen: 0.15,
  },
  fade_film: {
    brightness: 0.12,
    contrast: 0.85,
    saturation: 0.85,
    temperature: 0.2,
    vignette: 0.2,
    sharpen: 0,
  },
};

export function lookFromPreset(preset: LookPresetId): LookKnobs {
  return { preset, ...PRESET_DEFAULTS[preset] };
}

export function defaultLook(): LookKnobs {
  return lookFromPreset("none");
}

export function clampLook(look: LookKnobs): LookKnobs {
  return {
    preset: LOOK_PRESET_IDS.includes(look.preset) ? look.preset : "none",
    brightness: clamp(look.brightness, -1, 1),
    contrast: clamp(look.contrast, 0.5, 2),
    saturation: clamp(look.saturation, 0, 2),
    temperature: clamp(look.temperature, -1, 1),
    vignette: clamp(look.vignette, 0, 1),
    sharpen: clamp(look.sharpen, 0, 1),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isIdentityLook(look: LookKnobs | undefined | null): boolean {
  if (!look) return true;
  const c = clampLook(look);
  return (
    c.preset === "none" &&
    c.brightness === 0 &&
    c.contrast === 1 &&
    c.saturation === 1 &&
    c.temperature === 0 &&
    c.vignette === 0 &&
    c.sharpen === 0
  );
}

/** CSS filter string for canvas/video preview approximation. */
export function lookToCssFilter(look: LookKnobs | undefined | null): string {
  if (!look || isIdentityLook(look)) return "none";
  const c = clampLook(look);
  const brightness = 1 + c.brightness;
  const saturate = c.saturation;
  const contrast = c.contrast;
  // temperature approx via sepia + hue-rotate
  const sepia = Math.max(0, c.temperature) * 0.35;
  const hue = c.temperature * -12;
  const blur = c.preset === "soft" ? 0.6 : 0;
  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    sepia > 0.01 ? `sepia(${sepia.toFixed(3)})` : "",
    Math.abs(hue) > 0.5 ? `hue-rotate(${hue.toFixed(1)}deg)` : "",
    blur > 0 ? `blur(${blur}px)` : "",
  ].filter(Boolean);
  return parts.join(" ") || "none";
}

/**
 * ffmpeg filter fragment (no surrounding commas issues — join with commas).
 * Applied on a single video stream after scale.
 */
export function lookToFfmpegFilters(look: LookKnobs | undefined | null): string[] {
  if (!look || isIdentityLook(look)) return [];
  const c = clampLook(look);
  const filters: string[] = [];

  // eq: brightness -1..1 maps roughly; contrast/saturation direct-ish
  filters.push(
    `eq=brightness=${c.brightness.toFixed(3)}:contrast=${c.contrast.toFixed(3)}:saturation=${c.saturation.toFixed(3)}`,
  );

  if (Math.abs(c.temperature) > 0.02) {
    // rs/gs/bs shadows-mid-highlights simplified via colorbalance
    const t = c.temperature;
    const rs = (t * 0.08).toFixed(3);
    const bs = (-t * 0.08).toFixed(3);
    filters.push(`colorbalance=rs=${rs}:gs=0:bs=${bs}:rm=${rs}:bm=${bs}`);
  }

  if (c.preset === "soft") {
    filters.push("gblur=sigma=0.8");
  }

  if (c.vignette > 0.02) {
    const angle = (Math.PI / 4) * c.vignette;
    filters.push(`vignette=angle=${angle.toFixed(3)}`);
  }

  if (c.sharpen > 0.02) {
    const amount = (c.sharpen * 1.2).toFixed(3);
    filters.push(`unsharp=5:5:${amount}:5:5:0.0`);
  }

  return filters;
}
