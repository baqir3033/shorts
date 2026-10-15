"use client";

import { useMemo, useState } from "react";
import type { AnalysisResult, EditSpec, TextOverlay } from "@/media/edit-spec/types";
import {
  LOOK_PRESET_IDS,
  lookFromPreset,
  type LookPresetId,
} from "@/media/edit-spec/lookPresets";
import { planJumpCuts } from "@/media/edit-spec/jumpCutPlan";
import { normalizeEffects } from "@/media/edit-spec/normalizeEffects";

type Props = {
  spec: EditSpec;
  analysis: AnalysisResult | null;
  onChange: (next: EditSpec) => void;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
};

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function EffectsPanel({
  spec,
  analysis,
  onChange,
  selectedOverlayId,
  onSelectOverlay,
}: Props) {
  const [showAdvancedLook, setShowAdvancedLook] = useState(false);
  const [showSpeedSegments, setShowSpeedSegments] = useState(false);

  const look = spec.look ?? lookFromPreset("none");
  const rate = spec.source.playbackRate ?? 1;

  const jumpPreview = useMemo(() => {
    const jc = spec.jumpCuts ?? {
      enabled: false,
      removeSilencesAboveMs: 400,
      transitionMs: 120,
    };
    const words =
      analysis?.transcript?.words ??
      analysis?.transcript?.segments?.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
      })) ??
      [];
    return planJumpCuts({
      windowStartMs: spec.source.startMs,
      windowEndMs: spec.source.endMs,
      removeSilencesAboveMs: jc.removeSilencesAboveMs,
      silenceRanges: analysis?.silenceRanges,
      transcriptItems: words,
    });
  }, [spec, analysis]);

  const patch = (updater: (s: EditSpec) => EditSpec) => {
    onChange(normalizeEffects(updater(spec)));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold text-zinc-100">Effects</h2>

      {/* Look */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Look
          </h3>
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
            onClick={() =>
              patch((s) => ({ ...s, look: lookFromPreset("none") }))
            }
          >
            Reset
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LOOK_PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`rounded-lg px-2 py-1 text-xs capitalize ${
                look.preset === id
                  ? "bg-amber-400 font-semibold text-zinc-950"
                  : "border border-zinc-700 text-zinc-200"
              }`}
              onClick={() =>
                patch((s) => ({
                  ...s,
                  look: lookFromPreset(id as LookPresetId),
                }))
              }
            >
              {id.replace("_", " ")}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-xs text-amber-200/90"
          onClick={() => setShowAdvancedLook((v) => !v)}
        >
          {showAdvancedLook ? "Hide advanced" : "Advanced color"}
        </button>
        {showAdvancedLook ? (
          <div className="space-y-2 rounded-lg border border-zinc-800 p-2">
            {(
              [
                ["brightness", -1, 1, 0.01],
                ["contrast", 0.5, 2, 0.01],
                ["saturation", 0, 2, 0.01],
                ["temperature", -1, 1, 0.01],
                ["vignette", 0, 1, 0.01],
                ["sharpen", 0, 1, 0.01],
              ] as const
            ).map(([key, min, max, step]) => (
              <label key={key} className="block text-[11px] text-zinc-400">
                {key} ({look[key].toFixed(2)})
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={look[key]}
                  className="mt-1 w-full"
                  onChange={(e) =>
                    patch((s) => ({
                      ...s,
                      look: {
                        ...(s.look ?? lookFromPreset("none")),
                        [key]: Number(e.target.value),
                      },
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      {/* Speed */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Speed
          </h3>
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
            onClick={() =>
              patch((s) => ({
                ...s,
                source: {
                  ...s.source,
                  playbackRate: 1,
                  speedSegments: undefined,
                },
              }))
            }
          >
            Reset
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPEED_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              className={`rounded-lg px-2 py-1 text-xs ${
                Math.abs(rate - r) < 0.001
                  ? "bg-amber-400 font-semibold text-zinc-950"
                  : "border border-zinc-700 text-zinc-200"
              }`}
              onClick={() =>
                patch((s) => ({
                  ...s,
                  source: { ...s.source, playbackRate: r },
                }))
              }
            >
              {r}x
            </button>
          ))}
        </div>
        <label className="block text-[11px] text-zinc-400">
          Custom ({rate.toFixed(2)}x)
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={rate}
            className="mt-1 w-full"
            onChange={(e) =>
              patch((s) => ({
                ...s,
                source: {
                  ...s.source,
                  playbackRate: Number(e.target.value),
                },
              }))
            }
          />
        </label>
        <button
          type="button"
          className="text-xs text-amber-200/90"
          onClick={() => setShowSpeedSegments((v) => !v)}
        >
          {showSpeedSegments ? "Hide segments" : "Advanced segments"}
        </button>
        {showSpeedSegments ? (
          <div className="space-y-2 rounded-lg border border-zinc-800 p-2">
            {(spec.source.speedSegments ?? []).map((seg, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 text-[11px]">
                <label className="text-zinc-400">
                  Start s
                  <input
                    type="number"
                    step={0.1}
                    className="mt-0.5 w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5"
                    value={((seg.startMs - spec.source.startMs) / 1000).toFixed(1)}
                    onChange={(e) => {
                      const startMs =
                        spec.source.startMs + Number(e.target.value) * 1000;
                      patch((s) => {
                        const segs = [...(s.source.speedSegments ?? [])];
                        segs[i] = { ...segs[i], startMs };
                        return {
                          ...s,
                          source: { ...s.source, speedSegments: segs },
                        };
                      });
                    }}
                  />
                </label>
                <label className="text-zinc-400">
                  End s
                  <input
                    type="number"
                    step={0.1}
                    className="mt-0.5 w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5"
                    value={((seg.endMs - spec.source.startMs) / 1000).toFixed(1)}
                    onChange={(e) => {
                      const endMs =
                        spec.source.startMs + Number(e.target.value) * 1000;
                      patch((s) => {
                        const segs = [...(s.source.speedSegments ?? [])];
                        segs[i] = { ...segs[i], endMs };
                        return {
                          ...s,
                          source: { ...s.source, speedSegments: segs },
                        };
                      });
                    }}
                  />
                </label>
                <label className="text-zinc-400">
                  Rate
                  <input
                    type="number"
                    step={0.1}
                    min={0.25}
                    max={4}
                    className="mt-0.5 w-14 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5"
                    value={seg.rate}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      patch((s) => {
                        const segs = [...(s.source.speedSegments ?? [])];
                        segs[i] = { ...segs[i], rate: r };
                        return {
                          ...s,
                          source: { ...s.source, speedSegments: segs },
                        };
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="text-red-300"
                  onClick={() =>
                    patch((s) => ({
                      ...s,
                      source: {
                        ...s.source,
                        speedSegments: (s.source.speedSegments ?? []).filter(
                          (_, j) => j !== i,
                        ),
                      },
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200"
              onClick={() =>
                patch((s) => ({
                  ...s,
                  source: {
                    ...s.source,
                    speedSegments: [
                      ...(s.source.speedSegments ?? []),
                      {
                        startMs: s.source.startMs,
                        endMs: Math.min(
                          s.source.startMs + 3000,
                          s.source.endMs,
                        ),
                        rate: 1.5,
                      },
                    ],
                  },
                }))
              }
            >
              Add segment
            </button>
          </div>
        ) : null}
      </section>

      {/* Transform */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Transform
          </h3>
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
            onClick={() =>
              patch((s) => ({
                ...s,
                source: {
                  ...s.source,
                  flipX: false,
                  flipY: false,
                  rotateQuarterTurns: 0,
                },
              }))
            }
          >
            Reset
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-2 py-1 text-xs ${
              spec.source.flipX
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "border border-zinc-700 text-zinc-200"
            }`}
            onClick={() =>
              patch((s) => ({
                ...s,
                source: { ...s.source, flipX: !s.source.flipX },
              }))
            }
          >
            Flip H
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1 text-xs ${
              spec.source.flipY
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "border border-zinc-700 text-zinc-200"
            }`}
            onClick={() =>
              patch((s) => ({
                ...s,
                source: { ...s.source, flipY: !s.source.flipY },
              }))
            }
          >
            Flip V
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
            onClick={() =>
              patch((s) => ({
                ...s,
                source: {
                  ...s.source,
                  rotateQuarterTurns: ((((s.source.rotateQuarterTurns ?? 0) +
                    1) %
                    4) as 0 | 1 | 2 | 3),
                },
              }))
            }
          >
            Rotate 90° ({spec.source.rotateQuarterTurns ?? 0})
          </button>
        </div>
      </section>

      {/* Fade */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Fade
          </h3>
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
            onClick={() =>
              patch((s) => ({
                ...s,
                source: { ...s.source, fadeInMs: 0, fadeOutMs: 0 },
              }))
            }
          >
            Reset
          </button>
        </div>
        <label className="block text-[11px] text-zinc-400">
          Fade in ({((spec.source.fadeInMs ?? 0) / 1000).toFixed(2)}s)
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={spec.source.fadeInMs ?? 0}
            className="mt-1 w-full"
            onChange={(e) =>
              patch((s) => ({
                ...s,
                source: { ...s.source, fadeInMs: Number(e.target.value) },
              }))
            }
          />
        </label>
        <label className="block text-[11px] text-zinc-400">
          Fade out ({((spec.source.fadeOutMs ?? 0) / 1000).toFixed(2)}s)
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={spec.source.fadeOutMs ?? 0}
            className="mt-1 w-full"
            onChange={(e) =>
              patch((s) => ({
                ...s,
                source: { ...s.source, fadeOutMs: Number(e.target.value) },
              }))
            }
          />
        </label>
      </section>

      {/* Audio */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Source audio
        </h3>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={!!spec.source.sourceMuted}
            onChange={(e) =>
              patch((s) => ({
                ...s,
                source: { ...s.source, sourceMuted: e.target.checked },
              }))
            }
          />
          Mute source
        </label>
        <label className="block text-[11px] text-zinc-400">
          Volume ({(spec.reaction?.audio.sourceGain ?? 1).toFixed(2)})
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            disabled={!!spec.source.sourceMuted}
            value={spec.reaction?.audio.sourceGain ?? 1}
            className="mt-1 w-full"
            onChange={(e) =>
              patch((s) => ({
                ...s,
                reaction: {
                  kind: s.reaction?.kind ?? "none",
                  offsetMs: s.reaction?.offsetMs ?? 0,
                  audio: {
                    sourceGain: Number(e.target.value),
                    reactionGain: s.reaction?.audio.reactionGain ?? 0.8,
                    ducking: s.reaction?.audio.ducking ?? true,
                  },
                },
              }))
            }
          />
        </label>
      </section>

      {/* Jump cuts */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Jump cuts
        </h3>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={!!spec.jumpCuts?.enabled}
            disabled={!jumpPreview.hasSilenceData}
            onChange={(e) =>
              patch((s) => ({
                ...s,
                jumpCuts: {
                  enabled: e.target.checked,
                  removeSilencesAboveMs:
                    s.jumpCuts?.removeSilencesAboveMs ?? 400,
                  transitionMs: s.jumpCuts?.transitionMs ?? 120,
                },
              }))
            }
          />
          Remove long silences
        </label>
        {!jumpPreview.hasSilenceData ? (
          <p className="text-[11px] text-amber-200/80">
            Run Suggest once (or analysis with speech) so silence gaps are known.
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500">
            Would remove ~{jumpPreview.removedGapCount}s of gaps (
            {jumpPreview.keep.length} keep segments).
          </p>
        )}
        <label className="block text-[11px] text-zinc-400">
          Silence longer than{" "}
          {((spec.jumpCuts?.removeSilencesAboveMs ?? 400) / 1000).toFixed(1)}s
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={spec.jumpCuts?.removeSilencesAboveMs ?? 400}
            className="mt-1 w-full"
            onChange={(e) =>
              patch((s) => ({
                ...s,
                jumpCuts: {
                  enabled: s.jumpCuts?.enabled ?? false,
                  removeSilencesAboveMs: Number(e.target.value),
                  transitionMs: s.jumpCuts?.transitionMs ?? 120,
                },
              }))
            }
          />
        </label>
        <label className="block text-[11px] text-zinc-400">
          Transition
          <select
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={
              (spec.transitions?.[0]?.type === "fade_black"
                ? "fade_black"
                : spec.jumpCuts?.transitionMs
                  ? "dissolve"
                  : "none") as string
            }
            onChange={(e) => {
              const type = e.target.value as "none" | "dissolve" | "fade_black";
              patch((s) => ({
                ...s,
                jumpCuts: {
                  enabled: s.jumpCuts?.enabled ?? false,
                  removeSilencesAboveMs:
                    s.jumpCuts?.removeSilencesAboveMs ?? 400,
                  transitionMs: type === "none" ? 0 : s.jumpCuts?.transitionMs || 120,
                },
                transitions:
                  type === "none"
                    ? undefined
                    : [
                        {
                          afterSegmentIndex: 0,
                          type,
                          durationMs: s.jumpCuts?.transitionMs || 120,
                        },
                      ],
              }));
            }}
          >
            <option value="none">Hard cut</option>
            <option value="dissolve">Dissolve</option>
            <option value="fade_black">Fade black</option>
          </select>
        </label>
      </section>

      {/* Text overlays */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Text overlays
          </h3>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-200"
            disabled={(spec.textOverlays?.length ?? 0) >= 10}
            onClick={() => {
              const id = `tx-${Date.now()}`;
              const overlay: TextOverlay = {
                id,
                text: "Your text",
                startMs: 0,
                endMs: 2500,
                positionNorm: { x: 0.5, y: 0.25 },
                fontSize: 56,
                fontFamily: "bold",
                color: "#ffffff",
                animation: "pop",
              };
              patch((s) => ({
                ...s,
                textOverlays: [...(s.textOverlays ?? []), overlay],
              }));
              onSelectOverlay(id);
            }}
          >
            Add
          </button>
        </div>
        <ul className="max-h-40 space-y-2 overflow-auto">
          {(spec.textOverlays ?? []).map((o) => (
            <li
              key={o.id}
              className={`rounded-lg border p-2 text-xs ${
                selectedOverlayId === o.id
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "border-zinc-800"
              }`}
            >
              <button
                type="button"
                className="mb-1 w-full text-left font-medium text-zinc-100"
                onClick={() =>
                  onSelectOverlay(selectedOverlayId === o.id ? null : o.id)
                }
              >
                {o.text || "(empty)"}{" "}
                <span className="text-zinc-500">
                  · drag on preview when selected
                </span>
              </button>
              <input
                type="text"
                maxLength={200}
                value={o.text}
                className="mb-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                onChange={(e) =>
                  patch((s) => ({
                    ...s,
                    textOverlays: (s.textOverlays ?? []).map((x) =>
                      x.id === o.id ? { ...x, text: e.target.value } : x,
                    ),
                  }))
                }
              />
              <div className="flex gap-2">
                <label className="text-zinc-500">
                  Size
                  <input
                    type="number"
                    min={24}
                    max={120}
                    value={o.fontSize}
                    className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1"
                    onChange={(e) =>
                      patch((s) => ({
                        ...s,
                        textOverlays: (s.textOverlays ?? []).map((x) =>
                          x.id === o.id
                            ? { ...x, fontSize: Number(e.target.value) }
                            : x,
                        ),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-red-300"
                  onClick={() => {
                    patch((s) => ({
                      ...s,
                      textOverlays: (s.textOverlays ?? []).filter(
                        (x) => x.id !== o.id,
                      ),
                    }));
                    if (selectedOverlayId === o.id) onSelectOverlay(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
