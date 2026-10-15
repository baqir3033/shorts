/** Pick top-scoring clips that are spread across the timeline. */
export function pickDiverse<
  T extends { startMs: number; endMs: number; score: number },
>(
  ranked: T[],
  topK: number,
  opts: { durationMs: number; lengthMs: number },
): T[] {
  if (topK <= 0 || ranked.length === 0) return [];
  const minGap = Math.max(
    opts.lengthMs * 0.85,
    Math.min(30_000, opts.durationMs * 0.2),
  );

  const picked: T[] = [];
  for (const c of ranked) {
    const overlaps = picked.some(
      (p) => Math.abs(p.startMs - c.startMs) < minGap,
    );
    if (!overlaps) picked.push(c);
    if (picked.length >= topK) break;
  }

  // If too sparse, fill remaining by score ignoring gap (still prefer spread)
  if (picked.length < topK) {
    for (const c of ranked) {
      if (picked.includes(c)) continue;
      const heavy = picked.some((p) => timeIoU(p, c) > 0.55);
      if (!heavy) picked.push(c);
      if (picked.length >= topK) break;
    }
  }

  return picked.sort((a, b) => a.startMs - b.startMs);
}

function timeIoU(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): number {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  const inter = Math.max(0, end - start);
  const union = a.endMs - a.startMs + (b.endMs - b.startMs) - inter;
  return union <= 0 ? 0 : inter / union;
}
