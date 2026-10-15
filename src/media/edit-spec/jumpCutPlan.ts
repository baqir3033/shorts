export type TimeRange = { startMs: number; endMs: number };

const MAX_KEEP = 24;

/**
 * Invert silence ranges inside a window into keep (speech) ranges.
 */
export function keepRangesFromSilence(
  windowStartMs: number,
  windowEndMs: number,
  silenceRanges: TimeRange[],
  removeSilencesAboveMs: number,
): TimeRange[] {
  const winStart = Math.max(0, windowStartMs);
  const winEnd = Math.max(winStart + 1, windowEndMs);
  const threshold = Math.min(5000, Math.max(100, removeSilencesAboveMs));

  const silences = silenceRanges
    .map((s) => ({
      startMs: Math.max(winStart, s.startMs),
      endMs: Math.min(winEnd, s.endMs),
    }))
    .filter((s) => s.endMs - s.startMs >= threshold)
    .sort((a, b) => a.startMs - b.startMs);

  const keep: TimeRange[] = [];
  let cursor = winStart;
  for (const sil of silences) {
    if (sil.startMs > cursor) {
      keep.push({ startMs: cursor, endMs: sil.startMs });
    }
    cursor = Math.max(cursor, sil.endMs);
  }
  if (cursor < winEnd) {
    keep.push({ startMs: cursor, endMs: winEnd });
  }

  return mergeShortKeeps(keep.filter((k) => k.endMs > k.startMs + 40));
}

/**
 * Derive silence gaps from transcript word/segment timings when silenceRanges missing.
 */
export function silenceFromTranscriptGaps(
  windowStartMs: number,
  windowEndMs: number,
  wordsOrSegments: { startMs: number; endMs: number }[],
  minGapMs: number,
): TimeRange[] {
  const winStart = Math.max(0, windowStartMs);
  const winEnd = Math.max(winStart + 1, windowEndMs);
  const items = wordsOrSegments
    .map((w) => ({
      startMs: Math.max(winStart, w.startMs),
      endMs: Math.min(winEnd, w.endMs),
    }))
    .filter((w) => w.endMs > w.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (!items.length) return [];

  const gaps: TimeRange[] = [];
  if (items[0].startMs - winStart >= minGapMs) {
    gaps.push({ startMs: winStart, endMs: items[0].startMs });
  }
  for (let i = 0; i < items.length - 1; i++) {
    const gapStart = items[i].endMs;
    const gapEnd = items[i + 1].startMs;
    if (gapEnd - gapStart >= minGapMs) {
      gaps.push({ startMs: gapStart, endMs: gapEnd });
    }
  }
  const last = items[items.length - 1];
  if (winEnd - last.endMs >= minGapMs) {
    gaps.push({ startMs: last.endMs, endMs: winEnd });
  }
  return gaps;
}

function mergeShortKeeps(keep: TimeRange[]): TimeRange[] {
  if (keep.length <= MAX_KEEP) return keep;
  // Merge shortest gaps between keeps until ≤ MAX_KEEP
  type Gap = { i: number; dur: number };
  let ranges = [...keep];
  while (ranges.length > MAX_KEEP) {
    const gaps: Gap[] = [];
    for (let i = 0; i < ranges.length - 1; i++) {
      gaps.push({ i, dur: ranges[i + 1].startMs - ranges[i].endMs });
    }
    gaps.sort((a, b) => a.dur - b.dur);
    const mergeAt = gaps[0].i;
    const merged = {
      startMs: ranges[mergeAt].startMs,
      endMs: ranges[mergeAt + 1].endMs,
    };
    ranges = [
      ...ranges.slice(0, mergeAt),
      merged,
      ...ranges.slice(mergeAt + 2),
    ];
  }
  return ranges;
}

export function countRemovedGaps(
  windowStartMs: number,
  windowEndMs: number,
  keep: TimeRange[],
): number {
  if (!keep.length) return 0;
  let kept = 0;
  for (const k of keep) kept += k.endMs - k.startMs;
  const total = windowEndMs - windowStartMs;
  return Math.max(0, Math.round((total - kept) / 1000));
}

export type JumpCutPlan = {
  keep: TimeRange[];
  removedGapCount: number;
  hasSilenceData: boolean;
};

export function planJumpCuts(input: {
  windowStartMs: number;
  windowEndMs: number;
  removeSilencesAboveMs: number;
  silenceRanges?: TimeRange[] | null;
  transcriptItems?: { startMs: number; endMs: number }[] | null;
}): JumpCutPlan {
  const threshold = input.removeSilencesAboveMs;
  let silences = input.silenceRanges ?? [];
  let hasSilenceData = silences.length > 0;

  if (!hasSilenceData && input.transcriptItems?.length) {
    silences = silenceFromTranscriptGaps(
      input.windowStartMs,
      input.windowEndMs,
      input.transcriptItems,
      threshold,
    );
    hasSilenceData = silences.length > 0;
  }

  if (!hasSilenceData) {
    return {
      keep: [
        {
          startMs: input.windowStartMs,
          endMs: input.windowEndMs,
        },
      ],
      removedGapCount: 0,
      hasSilenceData: false,
    };
  }

  const keep = keepRangesFromSilence(
    input.windowStartMs,
    input.windowEndMs,
    silences,
    threshold,
  );
  return {
    keep: keep.length
      ? keep
      : [{ startMs: input.windowStartMs, endMs: input.windowEndMs }],
    removedGapCount: countRemovedGaps(
      input.windowStartMs,
      input.windowEndMs,
      keep,
    ),
    hasSilenceData: true,
  };
}
