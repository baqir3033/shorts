"use client";

import { useState } from "react";
import { resolveLengthMs } from "@/media/edit-spec/window";

export type LengthSetupValue = {
  lengthMs: number;
  mode: "manual" | "ai" | null;
};

type Props = {
  durationMs: number;
  busy: boolean;
  phaseMsg: string;
  suggestError: string | null;
  value: LengthSetupValue;
  onChange: (next: LengthSetupValue) => void;
  onSuggest: (opts: { lengthMs: number }) => Promise<void>;
  /** Soft-highlight mode buttons when coach asks to pick a mode */
  emphasizeMode?: boolean;
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
  suggestError,
  value,
  onChange,
  onSuggest,
  emphasizeMode,
}: Props) {
  const presetMatch = LENGTH_PRESETS.some(
    (p) => resolveLengthMs(p.ms, durationMs) === value.lengthMs,
  );
  const [useCustom, setUseCustom] = useState(!presetMatch);
  const [customSec, setCustomSec] = useState(
    Math.max(5, Math.round(value.lengthMs / 1000) || 45),
  );

  const resolvedLength = resolveLengthMs(value.lengthMs, durationMs);

  return (
    <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4 sm:p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-50">
          Choose short length
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          One short per pass. Pick the length, then Place manually or Suggest
          shorts.
        </p>
      </div>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">Seconds per short</h3>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          {LENGTH_PRESETS.map((p) => {
            const ms = resolveLengthMs(p.ms, durationMs);
            const selected = !useCustom && value.lengthMs === ms;
            return (
              <button
                key={p.ms}
                type="button"
                disabled={p.ms > durationMs}
                className={`min-h-11 rounded-lg px-3 py-2 text-sm ${
                  selected
                    ? "bg-amber-400 font-semibold text-zinc-950"
                    : "border border-zinc-700 text-zinc-200 disabled:opacity-40"
                }`}
                onClick={() => {
                  setUseCustom(false);
                  onChange({ ...value, lengthMs: ms });
                }}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            className={`min-h-11 rounded-lg px-3 py-2 text-sm sm:col-auto col-span-4 ${
              useCustom
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "border border-zinc-700 text-zinc-200"
            }`}
            onClick={() => {
              setUseCustom(true);
              onChange({
                ...value,
                lengthMs: resolveLengthMs(
                  Math.max(5_000, customSec * 1000),
                  durationMs,
                ),
              });
            }}
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
              max={Math.max(5, Math.floor(durationMs / 1000))}
              value={customSec}
              className="mt-1 min-h-11 w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
              onChange={(e) => {
                const sec = Number(e.target.value) || 5;
                setCustomSec(sec);
                onChange({
                  ...value,
                  lengthMs: resolveLengthMs(
                    Math.max(5_000, sec * 1000),
                    durationMs,
                  ),
                });
              }}
            />
          </label>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">How to place it</h3>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-coach-target="placeManual"
            disabled={busy}
            className={`min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 sm:w-auto ${
              value.mode === "manual"
                ? "bg-amber-400 text-zinc-950"
                : emphasizeMode
                  ? "border-2 border-amber-400 bg-amber-400/15 text-amber-50 ring-2 ring-amber-300/40"
                  : "bg-zinc-100 text-zinc-950"
            }`}
            onClick={() => onChange({ ...value, mode: "manual" })}
          >
            Place manually
          </button>
          <button
            type="button"
            data-coach-target="suggest"
            disabled={busy}
            className={`min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 sm:w-auto ${
              value.mode === "ai"
                ? "bg-amber-400 text-zinc-950"
                : emphasizeMode
                  ? "border-2 border-amber-400 bg-amber-400/15 text-amber-50 ring-2 ring-amber-300/40"
                  : "border border-amber-400/60 bg-amber-400/15 text-amber-50"
            }`}
            onClick={async () => {
              onChange({ ...value, mode: "ai" });
              await onSuggest({ lengthMs: resolvedLength });
            }}
          >
            {busy ? "Finding moments…" : "Suggest shorts"}
          </button>
        </div>
      </section>

      {busy && phaseMsg ? (
        <p className="text-xs text-zinc-400">{phaseMsg}</p>
      ) : null}
      {suggestError ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {suggestError}
        </p>
      ) : null}

      {value.mode === "manual" ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-zinc-950">
            1
          </span>
          Press{" "}
          <span className="font-semibold">Continue to place clip</span> — then
          drag the {Math.round(resolvedLength / 1000)}s box.
        </p>
      ) : null}
      {value.mode === "ai" && !busy && !suggestError ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-zinc-950">
            1
          </span>
          Press{" "}
          <span className="font-semibold">Continue to place clip</span> to pick
          one moment (single short).
        </p>
      ) : null}
    </div>
  );
}
