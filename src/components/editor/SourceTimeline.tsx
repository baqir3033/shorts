"use client";

import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  clampWindow,
  jumpWindowToMs,
  moveWindow,
} from "@/media/edit-spec/window";

type Props = {
  durationMs: number;
  lengthMs: number;
  startMs: number;
  playheadMs: number;
  onStartMsChange: (startMs: number) => void;
  onPlayheadChange?: (ms: number) => void;
  label?: string;
  emphasize?: boolean;
};

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SourceTimeline({
  durationMs,
  lengthMs,
  startMs,
  playheadMs,
  onStartMsChange,
  onPlayheadChange,
  label,
  emphasize,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ originX: number; originStart: number } | null>(
    null,
  );

  const win = clampWindow(startMs, lengthMs, durationMs);
  const L = win.lengthMs;
  const dur = Math.max(1, durationMs);
  const leftPct = (win.startMs / dur) * 100;
  const widthPct = (L / dur) * 100;
  const playheadPct = Math.min(100, Math.max(0, (playheadMs / dur) * 100));
  const lengthLabel = label ?? `${Math.round(L / 1000)}s`;

  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
      return Math.min(dur, Math.max(0, t * dur));
    },
    [dur],
  );

  const onPointerDownSelection = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { originX: e.clientX, originStart: win.startMs };
  };

  const onPointerMoveSelection = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const deltaPx = e.clientX - dragRef.current.originX;
    const deltaMs = (deltaPx / rect.width) * dur;
    const next = moveWindow(
      dragRef.current.originStart,
      deltaMs,
      L,
      durationMs,
    );
    onStartMsChange(next.startMs);
  };

  const onPointerUpSelection = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onTrackClick = (e: MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const clickMs = msFromClientX(e.clientX);
    const next = jumpWindowToMs(clickMs, L, durationMs);
    onStartMsChange(next.startMs);
    onPlayheadChange?.(next.startMs);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1000 : 500;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onStartMsChange(moveWindow(win.startMs, -step, L, durationMs).startMs);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onStartMsChange(moveWindow(win.startMs, step, L, durationMs).startMs);
    }
  };

  const ticks: number[] = [];
  const tickEvery = 10_000;
  for (let t = tickEvery; t < durationMs; t += tickEvery) ticks.push(t);

  const localPlayhead = Math.min(
    L,
    Math.max(0, playheadMs - win.startMs),
  );
  const localPct = L > 0 ? (localPlayhead / L) * 100 : 0;

  return (
    <div
      className={`space-y-3 ${
        emphasize
          ? "rounded-xl ring-2 ring-amber-400/70 ring-offset-2 ring-offset-zinc-950"
          : ""
      }`}
      data-coach-target="timeline"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-400">
        <span className="font-medium text-zinc-200">Full video</span>
        <span>
          {formatMs(win.startMs)} – {formatMs(win.endMs)}
          <span className="ml-2 text-amber-200/90">({lengthLabel} locked)</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-sm font-medium text-zinc-100 hover:border-zinc-500"
          aria-label="Nudge window earlier by 0.5 seconds"
          onClick={() =>
            onStartMsChange(
              moveWindow(win.startMs, -500, L, durationMs).startMs,
            )
          }
        >
          −0.5s
        </button>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, durationMs - L)}
          aria-valuenow={win.startMs}
          aria-label="Locked clip window on full video"
          className="relative h-14 min-w-0 flex-1 cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 sm:h-12"
          onClick={onTrackClick}
          onKeyDown={onKeyDown}
        >
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-zinc-700/80"
            style={{ left: `${(t / dur) * 100}%` }}
          />
        ))}

        <div
          className="absolute inset-y-1 cursor-grab rounded-md border border-amber-400/80 bg-amber-400/25 shadow-[0_0_0_1px_rgba(251,191,36,0.2)] active:cursor-grabbing"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 0.5)}%`,
          }}
          onPointerDown={onPointerDownSelection}
          onPointerMove={onPointerMoveSelection}
          onPointerUp={onPointerUpSelection}
          onPointerCancel={onPointerUpSelection}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-amber-50">
            {lengthLabel}
          </span>
        </div>

        <div
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-zinc-100"
          style={{ left: `${playheadPct}%` }}
        />

        <span className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-zinc-500">
          {formatMs(0)}
        </span>
        <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-500">
          {formatMs(durationMs)}
        </span>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-sm font-medium text-zinc-100 hover:border-zinc-500"
          aria-label="Nudge window later by 0.5 seconds"
          onClick={() =>
            onStartMsChange(
              moveWindow(win.startMs, 500, L, durationMs).startMs,
            )
          }
        >
          +0.5s
        </button>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-zinc-200">
          Selected short
        </div>
        <div className="relative h-8 overflow-hidden rounded-lg border border-amber-400/40 bg-amber-400/10">
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-zinc-50"
            style={{ left: `${localPct}%` }}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-amber-100/90">
            {formatMs(win.startMs)} → {formatMs(win.endMs)}
          </span>
        </div>
      </div>
    </div>
  );
}
