"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  canRedo,
  canUndo,
  createHistory,
  pushSpec,
  redo,
  undo,
} from "@/media/edit-spec/history";
import { defaultEditSpec } from "@/media/edit-spec/schema";
import type {
  AnalysisResult,
  ClipCandidate,
  EditSpec,
  EditorHistory,
  ProgressEvent,
} from "@/media/edit-spec/types";
import { analyze } from "@/media/analysis/analyze";
import { hasUsableTranscript } from "@/media/analysis/scoreCandidates";
import {
  getAnalysisLocal,
  getCachedSourceFile,
  getEditSpecLocal,
  getProjectMeta,
  saveAnalysisLocal,
  saveEditSpecLocal,
} from "@/media/ingest/indexedDb";
import { ingestReactionAsset } from "@/media/ingest/ingest";
import { centerCrop9x16, layoutPanes } from "@/media/render/layoutMath";
import { encodeEditSpec, EncodeError } from "@/media/render/encode";
import { detectDeviceCapability } from "@/lib/deviceCapability";
import {
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  PIP_SIZE_MAX,
  PIP_SIZE_MIN,
} from "@/lib/constants";
import { sliceWordsToClip } from "@/media/analysis/captions/groupCards";
import { flagEmphasisWords } from "@/media/analysis/shortsBrain/sentiment";
import type { CaptionStyleId, TimedWord } from "@/media/edit-spec/types";
import { PreviewStage } from "./PreviewStage";
import { ClipWizard, type WizardResult } from "./ClipWizard";
import { CaptionsPanel } from "./CaptionsPanel";

type Props = { projectId: string };

function suggestFailureMessage(degradations: string[] = []): string {
  const detail = degradations
    .find((d) => d.startsWith("whisper_detail:"))
    ?.slice("whisper_detail:".length);

  if (degradations.includes("whisper_skipped_safari_mode")) {
    return "Suggest needs a desktop Chrome/Edge browser (Safari skips speech AI). Use Manual trim, or try Chrome.";
  }
  if (degradations.includes("whisper_unavailable")) {
    return `Speech AI failed to load (needs network for ~40MB model). ${detail ? `Detail: ${detail}` : "Hard-refresh and retry, or use Manual trim."}`;
  }
  if (degradations.includes("whisper_audio_extract_failed")) {
    return `Couldn’t extract audio from this file. ${detail ? `Detail: ${detail}` : "Try another export or Manual trim."}`;
  }
  if (degradations.includes("whisper_oom")) {
    return "Not enough memory for speech AI on this clip. Use a shorter video or Manual trim.";
  }
  if (degradations.includes("whisper_low_speech")) {
    return "Almost no clear speech detected. Use Manual trim, or try a clearer talking-head clip.";
  }
  if (degradations.includes("whisper_failed")) {
    return `Speech recognition failed. ${detail ? `Detail: ${detail}` : "Hard-refresh and try again, or use Manual trim."}`;
  }
  return "Couldn’t hear speech clearly — use Manual trim instead of AI suggestions.";
}

export function EditorStudio({ projectId }: Props) {
  const searchParams = useSearchParams();
  const startInWizard = searchParams.get("step") !== "edit";

  const [step, setStep] = useState<"wizard" | "edit">(
    startInWizard ? "wizard" : "edit",
  );
  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedClips, setSelectedClips] = useState<ClipCandidate[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [phaseMsg, setPhaseMsg] = useState("");
  const [busy, setBusy] = useState<"analyze" | "encode" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [reactionFile, setReactionFile] = useState<File | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const capability = useMemo(() => detectDeviceCapability(), []);

  useEffect(() => {
    let revoked: string | null = null;
    (async () => {
      const meta = await getProjectMeta(projectId);
      const file = await getCachedSourceFile(projectId);
      if (!meta || !file) {
        setError("Project not found. Go home and upload again.");
        return;
      }
      setSourceFile(file);
      setDurationMs(meta.probe.durationMs);
      const url = URL.createObjectURL(file);
      revoked = url;
      setVideoUrl(url);

      const localSpec = await getEditSpecLocal(projectId, "main");
      const crop = centerCrop9x16({
        w: meta.probe.displayWidth,
        h: meta.probe.displayHeight,
      });
      // Prefer full-frame when already portrait
      const ar = meta.probe.displayWidth / meta.probe.displayHeight;
      const cropNorm = ar < 0.7 ? { x: 0, y: 0, w: 1, h: 1 } : crop;
      const base =
        localSpec?.spec ?? defaultEditSpec(meta.probe.durationMs, cropNorm);
      // Force PiP-only defaults
      if (base.layout.type !== "pip") {
        base.layout = {
          type: "pip",
          anchor: "tr",
          sizePercent: 18,
          marginPx: 24,
          fit: "cover",
        };
      }
      if (!base.reaction) {
        base.reaction = {
          kind: "none",
          offsetMs: 0,
          audio: { sourceGain: 1, reactionGain: 0.8, ducking: true },
        };
      }
      setHistory(createHistory(base));

      const cached = await getAnalysisLocal(projectId);
      if (cached) setAnalysis(cached.analysis);
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [projectId]);

  const spec = history?.present;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setScrubMs(Math.round(v.currentTime * 1000));
    v.addEventListener("timeupdate", sync);
    v.addEventListener("seeked", sync);
    return () => {
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("seeked", sync);
    };
  }, [videoUrl, step]);

  useEffect(() => {
    setScrubMs(spec?.source.startMs ?? 0);
  }, [spec?.source.startMs, clipIndex]);

  const persist = useCallback(
    async (next: EditSpec) => {
      await saveEditSpecLocal(projectId, "main", next);
      try {
        await fetch(`/api/projects/${projectId}/edit-spec`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: next, variantName: "main" }),
        });
      } catch {
        /* local ok */
      }
    },
    [projectId],
  );

  const patch = useCallback(
    (updater: (s: EditSpec) => EditSpec) => {
      setHistory((h) => {
        if (!h) return h;
        const next = updater(h.present);
        void persist(next);
        return pushSpec(h, next);
      });
    },
    [persist],
  );

  const captionsForRange = useCallback(
    (startMs: number, endMs: number): TimedWord[] => {
      const sliced = sliceWordsToClip(
        analysis?.transcript?.words,
        startMs,
        endMs,
      );
      return flagEmphasisWords(sliced);
    },
    [analysis],
  );

  const applyClip = useCallback(
    (c: ClipCandidate) => {
      const words = captionsForRange(c.startMs, c.endMs);
      patch((s) => ({
        ...s,
        source: {
          ...s.source,
          startMs: c.startMs,
          endMs: c.endMs,
          cropNorm: c.cropNorm,
        },
        captions: {
          enabled: s.captions?.enabled ?? true,
          styleId: s.captions?.styleId ?? "bold-white-outline",
          words,
        },
        layout:
          s.layout.type === "pip"
            ? s.layout
            : {
                type: "pip",
                anchor: "tr",
                sizePercent: 18,
                marginPx: 24,
                fit: "cover",
              },
      }));
    },
    [patch, captionsForRange],
  );

  const onSuggest = async (opts: { lengthMs: number; count: number }) => {
    if (!sourceFile) return;
    const meta = await getProjectMeta(projectId);
    if (!meta) return;
    setBusy("analyze");
    setSuggestError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const result = await analyze(sourceFile, {
        probe: meta.probe,
        safariMode: capability.mode === "safari-optimised",
        cores: capability.cores,
        lengthMs: opts.lengthMs,
        topK: opts.count,
        signal: abortRef.current.signal,
        onProgress: (ev: ProgressEvent) =>
          setPhaseMsg(`${ev.phase}: ${ev.message ?? ""} (${ev.percent}%)`),
      });
      setAnalysis(result);
      await saveAnalysisLocal(projectId, result);

      if (!hasUsableTranscript(result.transcript)) {
        const why = suggestFailureMessage(result.degradations);
        setSuggestError(why);
        return;
      }
      if (result.candidates.length === 0) {
        setSuggestError(
          "No strong short moments found for that length. Try another duration or Manual trim.",
        );
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Suggest failed");
    } finally {
      setBusy(null);
      setPhaseMsg("");
    }
  };

  const onWizardComplete = (result: WizardResult) => {
    if (result.mode === "manual" && result.manual) {
      const { startMs, endMs } = result.manual;
      const words = captionsForRange(startMs, endMs);
      patch((s) => ({
        ...s,
        source: {
          ...s.source,
          startMs,
          endMs,
        },
        captions: {
          enabled: true,
          styleId: s.captions?.styleId ?? "bold-white-outline",
          words,
        },
      }));
      setSelectedClips([]);
      setClipIndex(0);
    } else if (result.selected.length) {
      setSelectedClips(result.selected);
      setClipIndex(0);
      applyClip(result.selected[0]);
    }
    setStep("edit");
  };

  const runEncode = async () => {
    if (!sourceFile || !spec) return;
    const meta = await getProjectMeta(projectId);
    if (!meta) return;
    setBusy("encode");
    setError(null);
    setDownloadUrl(null);
    try {
      const result = await encodeEditSpec(
        spec,
        {
          source: sourceFile,
          reaction: reactionFile,
          reactionKind: spec.reaction?.kind ?? "none",
          probe: meta.probe,
        },
        {
          onProgress: (ev) =>
            setPhaseMsg(`${ev.phase}: ${ev.message ?? ""} (${ev.percent}%)`),
        },
      );
      const url = URL.createObjectURL(result.blob);
      setDownloadUrl(url);
      // Auto-download
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();

      const form = new FormData();
      form.set("variantName", "main");
      form.set("file", result.blob, result.fileName);
      await fetch(`/api/projects/${projectId}/render`, {
        method: "PUT",
        body: form,
      }).catch(() => undefined);
    } catch (err) {
      if (err instanceof EncodeError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Encode failed");
      }
    } finally {
      setBusy(null);
      setPhaseMsg("");
    }
  };

  const renderNext = async () => {
    if (clipIndex + 1 >= selectedClips.length) return;
    const next = clipIndex + 1;
    setClipIndex(next);
    applyClip(selectedClips[next]);
    setDownloadUrl(null);
  };

  if (error && !history) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-red-100">
        {error}
      </div>
    );
  }

  if (!history || !spec || !videoUrl) {
    return <div className="animate-pulse text-zinc-400">Loading editor…</div>;
  }

  if (step === "wizard") {
    return (
      <ClipWizard
        durationMs={durationMs}
        busy={busy === "analyze"}
        phaseMsg={phaseMsg}
        analysis={analysis}
        suggestError={suggestError}
        onSuggest={onSuggest}
        onComplete={onWizardComplete}
      />
    );
  }

  const panes = layoutPanes(
    spec.layout.type === "pip"
      ? spec.layout
      : { type: "pip", anchor: "tr", sizePercent: 18, marginPx: 24 },
    { w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT },
  );

  const pip = spec.layout.type === "pip" ? spec.layout : null;

  const capOn = !!spec.captions?.enabled;
  const styleId = (spec.captions?.styleId ??
    "bold-white-outline") as CaptionStyleId;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <ol className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <li className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-300">
            1. Pick clip
          </li>
          <li
            className={`rounded-full px-2.5 py-1 ${
              capOn
                ? "bg-amber-400/20 text-amber-100"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            2. Captions {capOn ? "on" : "off"}
          </li>
          <li className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-300">
            3. Render
          </li>
        </ol>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <button
            type="button"
            className="rounded-full border border-zinc-700 px-2 py-1 hover:border-zinc-500"
            onClick={() => setStep("wizard")}
          >
            ← Clip setup
          </button>
          {selectedClips.length > 0 ? (
            <span>
              Clip {clipIndex + 1} of {selectedClips.length}
            </span>
          ) : (
            <span>Manual clip</span>
          )}
          <span>
            · {((spec.source.endMs - spec.source.startMs) / 1000).toFixed(1)}s
          </span>
          <span>· PiP</span>
          <span>· Caps {capOn ? "on" : "off"}</span>
        </div>

        <PreviewStage
          videoUrl={videoUrl}
          spec={spec}
          panes={panes}
          videoRef={videoRef}
          onCropChange={(cropNorm) =>
            patch((s) => ({
              ...s,
              source: { ...s.source, cropNorm },
            }))
          }
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                if (
                  v.currentTime < spec.source.startMs / 1000 ||
                  v.currentTime >= spec.source.endMs / 1000
                ) {
                  v.currentTime = spec.source.startMs / 1000;
                }
                void v.play();
                setPlaying(true);
                const onEndedPause = () => {
                  if (v.paused) setPlaying(false);
                };
                v.addEventListener("pause", onEndedPause, { once: true });
              } else {
                v.pause();
                setPlaying(false);
              }
            }}
          >
            {playing ? "Pause" : "Play selection"}
          </button>
          <button
            type="button"
            disabled={!canUndo(history)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => setHistory((h) => (h ? undo(h) : h))}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo(history)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => setHistory((h) => (h ? redo(h) : h))}
          >
            Redo
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            onClick={() => void runEncode()}
          >
            {busy === "encode" ? "Rendering…" : "Render MP4"}
          </button>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
            >
              Download again
            </a>
          ) : null}
          {selectedClips.length > clipIndex + 1 ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm"
              onClick={() => void renderNext()}
            >
              Next selected clip
            </button>
          ) : null}
        </div>

        <label className="block text-xs text-zinc-400">
          Scrub within clip
          <input
            type="range"
            min={spec.source.startMs}
            max={Math.max(spec.source.startMs + 1, spec.source.endMs)}
            value={Math.min(
              spec.source.endMs,
              Math.max(
                spec.source.startMs,
                scrubMs || spec.source.startMs,
              ),
            )}
            className="mt-1 w-full"
            onChange={(e) => {
              const ms = Number(e.target.value);
              setScrubMs(ms);
              if (videoRef.current) videoRef.current.currentTime = ms / 1000;
            }}
          />
        </label>

        {phaseMsg ? <p className="text-xs text-zinc-400">{phaseMsg}</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </div>

      <aside className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
        <CaptionsPanel
          enabled={capOn}
          styleId={styleId}
          words={spec.captions?.words ?? []}
          onEnabledChange={(on) =>
            patch((s) => ({
              ...s,
              captions: {
                enabled: on,
                styleId: s.captions?.styleId ?? "bold-white-outline",
                words:
                  s.captions?.words?.length
                    ? s.captions.words
                    : captionsForRange(s.source.startMs, s.source.endMs),
              },
            }))
          }
          onStyleChange={(id) =>
            patch((s) => ({
              ...s,
              captions: {
                enabled: s.captions?.enabled ?? true,
                styleId: id,
                words: s.captions?.words ?? [],
              },
            }))
          }
          onWordsChange={(words) =>
            patch((s) => ({
              ...s,
              captions: {
                enabled: s.captions?.enabled ?? true,
                styleId: s.captions?.styleId ?? "bold-white-outline",
                words,
              },
            }))
          }
        />

        <section>
          <h2 className="text-sm font-semibold text-zinc-100">Timeline</h2>
          <label className="mt-2 block text-xs text-zinc-400">
            Start (s)
            <input
              type="number"
              step={0.1}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              value={(spec.source.startMs / 1000).toFixed(1)}
              onChange={(e) =>
                patch((s) => ({
                  ...s,
                  source: {
                    ...s.source,
                    startMs: Math.max(0, Number(e.target.value) * 1000 || 0),
                  },
                }))
              }
            />
          </label>
          <label className="mt-2 block text-xs text-zinc-400">
            End (s)
            <input
              type="number"
              step={0.1}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              value={(spec.source.endMs / 1000).toFixed(1)}
              onChange={(e) =>
                patch((s) => ({
                  ...s,
                  source: {
                    ...s.source,
                    endMs: Math.max(
                      s.source.startMs + 500,
                      Number(e.target.value) * 1000 || 0,
                    ),
                  },
                }))
              }
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
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
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
                        anchor: s.layout.type === "pip" ? s.layout.anchor : "tr",
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
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-400/70 bg-zinc-950/60 px-4 py-6 text-center transition hover:border-amber-300 hover:bg-amber-400/5">
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
                  const media = await ingestReactionAsset(file, { projectId });
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
                      anchor:
                        s.layout.type === "pip" ? s.layout.anchor : "tr",
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
              className="mt-2 text-xs font-medium text-red-300 underline-offset-2 hover:underline"
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
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
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

        {selectedClips.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold text-zinc-100">
              Selected shorts
            </h2>
            <ul className="mt-2 max-h-40 space-y-2 overflow-auto text-xs">
              {selectedClips.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-2 py-2 text-left ${
                      i === clipIndex
                        ? "border-amber-400/50 bg-amber-400/10"
                        : "border-zinc-800 bg-zinc-900/80"
                    }`}
                    onClick={() => {
                      setClipIndex(i);
                      applyClip(c);
                    }}
                  >
                    <div className="font-medium text-zinc-100">
                      #{i + 1} {(c.startMs / 1000).toFixed(1)}s–
                      {(c.endMs / 1000).toFixed(1)}s
                    </div>
                    {c.quote ? (
                      <div className="text-zinc-300">“{c.quote}”</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
