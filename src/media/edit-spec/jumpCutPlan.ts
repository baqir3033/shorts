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
  /** True when silence ranges or a transcript timeline is available to plan cuts. */
  hasSpeechTimeline: boolean;
  /** True when at least one gap above the threshold was found in the window. */
  foundGaps: boolean;
  /** @deprecated use hasSpeechTimeline — kept for older call sites */
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
  const hasSpeechTimeline =
    (input.silenceRanges?.length ?? 0) > 0 ||
    (input.transcriptItems?.length ?? 0) > 0;

  let silences = (input.silenceRanges ?? []).filter(
    (s) => s.endMs > s.startMs,
  );

  if (!silences.length && input.transcriptItems?.length) {
    // Use a low floor so we always surface gaps when speech timing exists;
    // keepRangesFromSilence still applies the user threshold.
    silences = silenceFromTranscriptGaps(
      input.windowStartMs,
      input.windowEndMs,
      input.transcriptItems,
      Math.min(threshold, 200),
    );
  }

  if (!hasSpeechTimeline) {
    return {
      keep: [
        {
          startMs: input.windowStartMs,
          endMs: input.windowEndMs,
        },
      ],
      removedGapCount: 0,
      hasSpeechTimeline: false,
      foundGaps: false,
      hasSilenceData: false,
    };
  }

  const keep = keepRangesFromSilence(
    input.windowStartMs,
    input.windowEndMs,
    silences,
    threshold,
  );
  const resolvedKeep = keep.length
    ? keep
    : [{ startMs: input.windowStartMs, endMs: input.windowEndMs }];
  const removedGapCount = countRemovedGaps(
    input.windowStartMs,
    input.windowEndMs,
    resolvedKeep,
  );
  const foundGaps = removedGapCount > 0 || keep.length > 1;

  return {
    keep: resolvedKeep,
    removedGapCount,
    hasSpeechTimeline: true,
    foundGaps,
    hasSilenceData: true,
  };
}

export type SilenceRefillPlan = {
  /** Expanded source harvest covering all keep pieces */
  harvestStartMs: number;
  harvestEndMs: number;
  /** Speech islands to concat (sum ≈ targetLengthMs) */
  keep: TimeRange[];
  keptMs: number;
  targetLengthMs: number;
  removedSilenceMs: number;
  metTarget: boolean;
};

/**
 * Cut silences starting at the selected short, then pull more source
 * (forward, then backward) until kept speech ≈ targetLengthMs (e.g. 30s/40s).
 */
export function planSilenceRefill(input: {
  anchorStartMs: number;
  targetLengthMs: number;
  durationMs: number;
  silenceRanges: TimeRange[];
  removeSilencesAboveMs: number;
}): SilenceRefillPlan {
  const target = Math.max(1000, input.targetLengthMs);
  const durationMs = Math.max(0, input.durationMs);
  const threshold = Math.min(5000, Math.max(100, input.removeSilencesAboveMs));
  const anchor = Math.min(Math.max(0, input.anchorStartMs), durationMs);

  const allKeep = keepRangesFromSilence(
    0,
    durationMs,
    input.silenceRanges,
    threshold,
  );

  const kept: TimeRange[] = [];
  let sum = 0;

  const takeFrom = (piece: TimeRange, prepend: boolean) => {
    if (sum >= target) return;
    const need = target - sum;
    const dur = piece.endMs - piece.startMs;
    if (dur <= 0) return;
    const slice =
      dur <= need
        ? piece
        : prepend
          ? { startMs: piece.endMs - need, endMs: piece.endMs }
          : { startMs: piece.startMs, endMs: piece.startMs + need };
    if (prepend) kept.unshift(slice);
    else kept.push(slice);
    sum += slice.endMs - slice.startMs;
  };

  // 1) Forward from anchor (primary — “add more video after the cut”)
  for (const k of allKeep) {
    if (k.endMs <= anchor) continue;
    takeFrom(
      {
        startMs: Math.max(k.startMs, anchor),
        endMs: k.endMs,
      },
      false,
    );
    if (sum >= target) break;
  }

  // 2) If still short, pull speech before the anchor
  if (sum < target) {
    const before = [...allKeep]
      .filter((k) => k.startMs < anchor)
      .sort((a, b) => b.endMs - a.endMs);
    for (const k of before) {
      takeFrom(
        {
          startMs: k.startMs,
          endMs: Math.min(k.endMs, anchor),
        },
        true,
      );
      if (sum >= target) break;
    }
  }

  kept.sort((a, b) => a.startMs - b.startMs);
  const merged = mergeAdjacent(kept);

  if (!merged.length) {
    const end = Math.min(durationMs, anchor + target);
    return {
      harvestStartMs: anchor,
      harvestEndMs: Math.max(anchor + 1, end),
      keep: [{ startMs: anchor, endMs: Math.max(anchor + 1, end) }],
      keptMs: Math.max(0, end - anchor),
      targetLengthMs: target,
      removedSilenceMs: 0,
      metTarget: end - anchor >= target * 0.95,
    };
  }

  const harvestStartMs = merged[0].startMs;
  const harvestEndMs = merged[merged.length - 1].endMs;
  const span = harvestEndMs - harvestStartMs;
  const removedSilenceMs = Math.max(0, span - sum);

  return {
    harvestStartMs,
    harvestEndMs,
    keep: mergeShortKeeps(merged),
    keptMs: sum,
    targetLengthMs: target,
    removedSilenceMs,
    metTarget: sum >= target * 0.95,
  };
}

function mergeAdjacent(ranges: TimeRange[]): TimeRange[] {
  if (!ranges.length) return [];
  const out: TimeRange[] = [{ ...ranges[0] }];
  for (let i = 1; i < ranges.length; i++) {
    const prev = out[out.length - 1];
    const cur = ranges[i];
    if (cur.startMs <= prev.endMs + 20) {
      prev.endMs = Math.max(prev.endMs, cur.endMs);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}
