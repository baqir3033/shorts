export type LockedWindow = {
  startMs: number;
  endMs: number;
  lengthMs: number;
};

/** Clamp requested length to source duration (R1). */
export function resolveLengthMs(requestedMs: number, durationMs: number): number {
  const dur = Math.max(0, durationMs);
  if (dur <= 0) return 0;
  return Math.min(Math.max(0, requestedMs), dur);
}

/** Place a locked window at startMs, clamping into bounds (R1–R3). */
export function clampWindow(
  startMs: number,
  lengthMs: number,
  durationMs: number,
): LockedWindow {
  const L = resolveLengthMs(lengthMs, durationMs);
  const maxStart = Math.max(0, durationMs - L);
  const start = Math.min(Math.max(0, startMs), maxStart);
  return { startMs: start, endMs: start + L, lengthMs: L };
}

/** Slide the locked window by deltaMs (R2). */
export function moveWindow(
  startMs: number,
  deltaMs: number,
  lengthMs: number,
  durationMs: number,
): LockedWindow {
  return clampWindow(startMs + deltaMs, lengthMs, durationMs);
}

/** Default window at the start of the source (R5). */
export function windowFromLength(
  lengthMs: number,
  durationMs: number,
): LockedWindow {
  return clampWindow(0, lengthMs, durationMs);
}

/**
 * Jump so clickMs falls inside the window when possible (R2).
 * Centers the window on the click, then clamps.
 */
export function jumpWindowToMs(
  clickMs: number,
  lengthMs: number,
  durationMs: number,
): LockedWindow {
  const L = resolveLengthMs(lengthMs, durationMs);
  return clampWindow(clickMs - L / 2, L, durationMs);
}
