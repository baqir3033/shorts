"use client";

import { useState } from "react";
import { resolveLengthMs } from "@/media/edit-spec/window";

export type LengthSetupValue = {
  lengthMs: number;
  count: number;
  mode: "manual" | "ai" | null;
};

type Props = {
  durationMs: number;
  busy: boolean;
  phaseMsg: string;
  suggestError: string | null;
  value: LengthSetupValue;
  onChange: (next: LengthSetupValue) => void;
  onSuggest: (opts: { lengthMs: number; count: number }) => Promise<void>;
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
    <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-50">
          Choose short length
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Pick how long each short is. Next you&apos;ll slide a fixed window
          along the full video — length won&apos;t change.
        </p>
      </div>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">Seconds per short</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {LENGTH_PRESETS.map((p) => {
            const ms = resolveLengthMs(p.ms, durationMs);
            const selected = !useCustom && value.lengthMs === ms;
            return (
              <button
                key={p.ms}
                type="button"
                disabled={p.ms > durationMs}
                className={`rounded-lg px-3 py-1.5 text-sm ${
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
            className={`rounded-lg px-3 py-1.5 text-sm ${
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
              className="mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
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
        <h3 className="text-sm font-medium text-zinc-200">
          How many shorts? ({value.count})
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Used when you ask AI to suggest moments.
        </p>
        <input
          type="range"
          min={1}
          max={8}
          value={value.count}
          className="mt-2 w-full"
          onChange={(e) =>
            onChange({ ...value, count: Number(e.target.value) })
          }
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
            value.mode === "manual"
              ? "bg-amber-400 text-zinc-950"
              : "bg-zinc-100 text-zinc-950"
          }`}
          onClick={() => onChange({ ...value, mode: "manual" })}
        >
          Place manually
        </button>
        <button
          type="button"
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
            value.mode === "ai"
              ? "bg-amber-400 text-zinc-950"
              : "border border-amber-400/60 bg-amber-400/15 text-amber-50"
          }`}
          onClick={async () => {
            onChange({ ...value, mode: "ai" });
            await onSuggest({
              lengthMs: resolvedLength,
              count: value.count,
            });
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

      {value.mode === "manual" ? (
        <p className="text-sm text-zinc-400">
          Next: drag the {Math.round(resolvedLength / 1000)}s box on the full
          timeline to pick your chunk.
        </p>
      ) : null}
      {value.mode === "ai" && !busy ? (
        <p className="text-sm text-zinc-400">
          Next: pick a suggested moment, then fine-tune by sliding the locked
          box.
        </p>
      ) : null}
    </div>
  );
}
