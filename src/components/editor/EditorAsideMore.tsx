"use client";

import type { ClipCandidate, EditSpec } from "@/media/edit-spec/types";
import { ingestReactionAsset } from "@/media/ingest/ingest";
import { PIP_SIZE_MAX, PIP_SIZE_MIN } from "@/lib/constants";

type PipLayout = Extract<EditSpec["layout"], { type: "pip" }>;

type Props = {
  spec: EditSpec;
  lengthLabel: string;
  pip: PipLayout | null;
  reactionFile: File | null;
  activeCandidate: ClipCandidate | null;
  applyLockedWindow: (startMs: number) => void;
  patch: (fn: (s: EditSpec) => EditSpec) => void;
  setReactionFile: (file: File | null) => void;
  setError: (msg: string | null) => void;
  projectId: string;
};

export function EditorAsideMore({
  spec,
  lengthLabel,
  pip,
  reactionFile,
  activeCandidate,
  applyLockedWindow,
  patch,
  setReactionFile,
  setError,
  projectId,
}: Props) {
  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-sm font-semibold text-zinc-100">
          Window ({lengthLabel} locked)
        </h2>
        <label className="mt-2 block text-xs text-zinc-400">
          Start (s)
          <input
            type="number"
            step={0.1}
            className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
            value={(spec.source.startMs / 1000).toFixed(1)}
            onChange={(e) =>
              applyLockedWindow(Number(e.target.value) * 1000 || 0)
            }
          />
        </label>
        <label className="mt-2 block text-xs text-zinc-400">
          End (s) — derived
          <input
            type="number"
            step={0.1}
            disabled
            className="mt-1 min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-500"
            value={(spec.source.endMs / 1000).toFixed(1)}
          />
        </label>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-100">
          Picture-in-picture
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Full-frame short. PiP corner only appears if you add a reaction.
        </p>
        {pip ? (
          <>
            <label className="mt-2 block text-xs text-zinc-400">
              Anchor
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
                value={pip.anchor}
                onChange={(e) =>
                  patch((s) => ({
                    ...s,
                    layout: {
                      type: "pip",
                      anchor: e.target.value as "tl" | "tr" | "bl" | "br",
                      sizePercent:
                        s.layout.type === "pip" ? s.layout.sizePercent : 10,
                      marginPx:
                        s.layout.type === "pip" ? s.layout.marginPx : 24,
                      fit: "cover",
                    },
                  }))
                }
              >
                <option value="tr">Top right</option>
                <option value="tl">Top left</option>
                <option value="br">Bottom right</option>
                <option value="bl">Bottom left</option>
              </select>
            </label>
            <label className="mt-2 block text-xs text-zinc-400">
              Size ({pip.sizePercent}%)
              <input
                type="range"
                min={PIP_SIZE_MIN}
                max={PIP_SIZE_MAX}
                value={pip.sizePercent}
                className="mt-1 w-full"
                onChange={(e) =>
                  patch((s) => ({
                    ...s,
                    layout: {
                      type: "pip",
                      anchor:
                        s.layout.type === "pip" ? s.layout.anchor : "tr",
                      sizePercent: Number(e.target.value),
                      marginPx:
                        s.layout.type === "pip" ? s.layout.marginPx : 24,
                      fit: "cover",
                    },
                  }))
                }
              />
            </label>
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
        <h2 className="text-sm font-semibold text-zinc-50">
          Add your reaction
        </h2>
        <p className="mt-1 text-xs text-zinc-300">
          Upload your face cam or a still image — it shows as a PiP corner on
          the short.
        </p>
        <label className="mt-3 flex min-h-11 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-400/70 bg-zinc-950/60 px-4 py-6 text-center transition hover:border-amber-300 hover:bg-amber-400/5">
          <span className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950">
            {reactionFile || spec.reaction?.kind !== "none"
              ? "Replace reaction file"
              : "Upload image or video"}
          </span>
          <span className="text-xs text-zinc-400">
            JPG, PNG, or MP4 · shown at {pip?.sizePercent ?? 18}% corner
          </span>
          <input
            type="file"
            accept="video/*,image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const media = await ingestReactionAsset(file, {
                  projectId,
                });
                setReactionFile(file);
                patch((s) => ({
                  ...s,
                  reaction: {
                    kind:
                      media.kind === "reaction-image" ? "image" : "video",
                    offsetMs: 0,
                    audio: {
                      sourceGain: 1,
                      reactionGain: 0.8,
                      ducking: true,
                    },
                  },
                  layout: {
                    type: "pip",
                    anchor: s.layout.type === "pip" ? s.layout.anchor : "tr",
                    sizePercent:
                      s.layout.type === "pip"
                        ? Math.max(s.layout.sizePercent, 18)
                        : 18,
                    marginPx:
                      s.layout.type === "pip" ? s.layout.marginPx : 24,
                    fit: "cover",
                  },
                }));
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Reaction upload failed",
                );
              }
            }}
          />
        </label>
        {reactionFile ? (
          <p className="mt-2 truncate text-xs text-emerald-200">
            Loaded: {reactionFile.name}
          </p>
        ) : null}
        {spec.reaction?.kind !== "none" ? (
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-medium text-red-300 underline-offset-2 hover:underline"
            onClick={() => {
              setReactionFile(null);
              patch((s) => ({
                ...s,
                reaction: {
                  kind: "none",
                  offsetMs: 0,
                  audio: {
                    sourceGain: 1,
                    reactionGain: 0.8,
                    ducking: true,
                  },
                },
              }));
            }}
          >
            Remove reaction
          </button>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            Without a reaction, export is full-frame source only.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-100">Crop</h2>
        {(["x", "y", "w", "h"] as const).map((key) => (
          <label key={key} className="mt-2 block text-xs text-zinc-400">
            {key}
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
              value={spec.source.cropNorm[key]}
              onChange={(e) =>
                patch((s) => ({
                  ...s,
                  source: {
                    ...s.source,
                    cropNorm: {
                      ...s.source.cropNorm,
                      [key]: Number(e.target.value),
                    },
                  },
                }))
              }
            />
          </label>
        ))}
      </section>

      {activeCandidate ? (
        <section className="text-xs text-zinc-400">
          <h2 className="text-sm font-semibold text-zinc-100">Active moment</h2>
          <p className="mt-1 text-zinc-300">
            {(activeCandidate.startMs / 1000).toFixed(1)}s–
            {(activeCandidate.endMs / 1000).toFixed(1)}s
            {activeCandidate.title ? ` · ${activeCandidate.title}` : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}
