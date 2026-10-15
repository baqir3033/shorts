"use client";

import { useState } from "react";
import type { AnalysisResult, ClipCandidate } from "@/media/edit-spec/types";

export type WizardResult = {
  lengthMs: number;
  count: number;
  mode: "manual" | "ai";
  selected: ClipCandidate[];
  manual?: { startMs: number; endMs: number };
};

type Props = {
  durationMs: number;
  busy: boolean;
  phaseMsg: string;
  analysis: AnalysisResult | null;
  suggestError: string | null;
  onSuggest: (opts: { lengthMs: number; count: number }) => Promise<void>;
  onComplete: (result: WizardResult) => void;
};

const LENGTH_PRESETS = [
  { label: "15s", ms: 15_000 },
  { label: "30s", ms: 30_000 },
  { label: "40s", ms: 40_000 },
  { label: "60s", ms: 60_000 },
];

export function ClipWizard({
  durationMs,
  busy,
  phaseMsg,
  analysis,
  suggestError,
  onSuggest,
  onComplete,
}: Props) {
  const [lengthMs, setLengthMs] = useState(30_000);
  const [customSec, setCustomSec] = useState(45);
  const [useCustom, setUseCustom] = useState(false);
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"manual" | "ai" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(
    Math.min(durationMs, 30_000),
  );

  const resolvedLength = useCustom
    ? Math.min(durationMs, Math.max(5_000, customSec * 1000))
    : lengthMs;

  const candidates = analysis?.candidates ?? [];

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < count) next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-50">
          Set up your shorts
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          AI finds moments with a hook and a payoff from speech — not zooms.
          Nothing is cut until you confirm.
        </p>
      </div>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">Seconds per short</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {LENGTH_PRESETS.map((p) => (
            <button
              key={p.ms}
              type="button"
              disabled={p.ms > durationMs}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                !useCustom && lengthMs === p.ms
                  ? "bg-amber-400 font-semibold text-zinc-950"
                  : "border border-zinc-700 text-zinc-200 disabled:opacity-40"
              }`}
              onClick={() => {
                setUseCustom(false);
                setLengthMs(p.ms);
                setManualEnd(Math.min(durationMs, manualStart + p.ms));
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm ${
              useCustom
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "border border-zinc-700 text-zinc-200"
            }`}
            onClick={() => setUseCustom(true)}
          >
            Custom
          </button>
        </div>
        {useCustom ? (
          <label className="mt-2 block text-xs text-zinc-400">
            Custom seconds
            <input
              type="number"
              min={5}
              max={Math.floor(durationMs / 1000)}
              value={customSec}
              className="mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              onChange={(e) => setCustomSec(Number(e.target.value) || 5)}
            />
          </label>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">
          How many shorts? ({count})
        </h3>
        <input
          type="range"
          min={1}
          max={8}
          value={count}
          className="mt-2 w-full"
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          onClick={() => {
            setMode("manual");
            setManualEnd(
              Math.min(durationMs, manualStart + resolvedLength),
            );
          }}
        >
          Manual trim
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          onClick={async () => {
            setMode("ai");
            setSelectedIds(new Set());
            await onSuggest({ lengthMs: resolvedLength, count });
          }}
        >
          {busy ? "Finding moments…" : "Suggest shorts"}
        </button>
      </section>

      {busy && phaseMsg ? (
        <p className="text-xs text-zinc-400">{phaseMsg}</p>
      ) : null}
      {suggestError ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {suggestError}
        </p>
      ) : null}

      {mode === "manual" ? (
        <section className="space-y-3 rounded-xl border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Manual range</h3>
          <label className="block text-xs text-zinc-400">
            Start (seconds)
            <input
              type="number"
              min={0}
              max={durationMs / 1000}
              step={0.1}
              value={(manualStart / 1000).toFixed(1)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              onChange={(e) => {
                const s = Math.max(0, Number(e.target.value) * 1000);
                setManualStart(s);
                setManualEnd(Math.min(durationMs, s + resolvedLength));
              }}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            End (seconds)
            <input
              type="number"
              min={0}
              max={durationMs / 1000}
              step={0.1}
              value={(manualEnd / 1000).toFixed(1)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              onChange={(e) =>
                setManualEnd(
                  Math.min(durationMs, Math.max(manualStart + 1000, Number(e.target.value) * 1000)),
                )
              }
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
            onClick={() =>
              onComplete({
                lengthMs: resolvedLength,
                count: 1,
                mode: "manual",
                selected: [],
                manual: { startMs: manualStart, endMs: manualEnd },
              })
            }
          >
            Use this range
          </button>
        </section>
      ) : null}

      {mode === "ai" && candidates.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">
            Pick up to {count} moments
          </h3>
          <p className="text-xs text-zinc-500">
            Each card is a speech moment (hook → idea → ending). Vertical crop
            is just fit-to-phone, not the AI.
          </p>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {candidates.map((c, i) => {
              const on = selectedIds.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                      on
                        ? "border-amber-400/60 bg-amber-400/10"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-zinc-100">
                        Moment {i + 1} · {(c.startMs / 1000).toFixed(1)}s–
                        {(c.endMs / 1000).toFixed(1)}s
                      </span>
                      <span className="text-xs text-zinc-500">
                        {Math.round(c.score * 100)}
                      </span>
                    </div>
                    {c.title ? (
                      <p className="mt-1 text-sm font-semibold text-amber-100">
                        {c.title}
                      </p>
                    ) : null}
                    {c.quote ? (
                      <p className="mt-1 text-base leading-snug text-zinc-50">
                        “{c.quote}”
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-400">{c.reason}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            onClick={() => {
              const selected = candidates.filter((c) => selectedIds.has(c.id));
              onComplete({
                lengthMs: resolvedLength,
                count,
                mode: "ai",
                selected,
              });
            }}
          >
            Edit selected ({selectedIds.size})
          </button>
        </section>
      ) : null}
    </div>
  );
}
