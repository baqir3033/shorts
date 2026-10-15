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
import {
  clampWindow,
  resolveLengthMs,
  windowFromLength,
} from "@/media/edit-spec/window";
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
import { centerCrop9x16, layoutPanes } from "@/media/render/layoutMath";
import { encodeEditSpec, EncodeError } from "@/media/render/encode";
import { detectDeviceCapability } from "@/lib/deviceCapability";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/lib/constants";
import { sliceWordsToClip } from "@/media/analysis/captions/groupCards";
import { flagEmphasisWords } from "@/media/analysis/shortsBrain/sentiment";
import type { CaptionStyleId, TimedWord } from "@/media/edit-spec/types";
import { PreviewStage } from "./PreviewStage";
import { ClipWizard, type LengthSetupValue } from "./ClipWizard";
import { CaptionsPanel } from "./CaptionsPanel";
import { EffectsPanel } from "./EffectsPanel";
import { SourceTimeline } from "./SourceTimeline";
import {
  COACH_STEP_ORDER,
  EditorStepRail,
  type CoachStep,
} from "./EditorStepRail";
import { normalizeEffects } from "@/media/edit-spec/normalizeEffects";
import { resolveNextAction } from "./coach/nextAction";
import { CoachCue, COACH_PULSE_CLASS } from "./coach/CoachCue";
import { EncodeProgressOverlay } from "./EncodeProgressOverlay";
import { MobileActionDock } from "./MobileActionDock";
import {
  PolishMobileTabs,
  type PolishTabId,
} from "./PolishMobileTabs";
import { EditorAsideMore } from "./EditorAsideMore";
import { useIsLg } from "@/lib/useMediaQuery";

type Props = { projectId: string };

function suggestFailureMessage(degradations: string[] = []): string {
  const detail = degradations
    .find((d) => d.startsWith("whisper_detail:"))
    ?.slice("whisper_detail:".length);

  if (degradations.includes("whisper_skipped_safari_mode")) {
    return "Suggest needs a desktop Chrome/Edge browser (Safari skips speech AI). Use Place manually, or try Chrome.";
  }
  if (degradations.includes("whisper_unavailable")) {
    return `Speech AI failed to load (needs network for ~40MB model). ${detail ? `Detail: ${detail}` : "Hard-refresh and retry, or place manually."}`;
  }
  if (degradations.includes("whisper_audio_extract_failed")) {
    return `Couldn’t extract audio from this file. ${detail ? `Detail: ${detail}` : "Try another export or place manually."}`;
  }
  if (degradations.includes("whisper_oom")) {
    return "Not enough memory for speech AI on this clip. Use a shorter video or place manually.";
  }
  if (degradations.includes("whisper_low_speech")) {
    return "Almost no clear speech detected. Place manually, or try a clearer talking-head clip.";
  }
  if (degradations.includes("whisper_failed")) {
    return `Speech recognition failed. ${detail ? `Detail: ${detail}` : "Hard-refresh and try again, or place manually."}`;
  }
  return "Couldn’t hear speech clearly — place the window manually instead of AI suggestions.";
}

function maxReachableStep(
  lengthReady: boolean,
  placeConfirmed: boolean,
): CoachStep {
  if (!lengthReady) return "length";
  if (!placeConfirmed) return "place";
  return "render";
}

export function EditorStudio({ projectId }: Props) {
  const searchParams = useSearchParams();
  const skipToEdit = searchParams.get("step") === "edit";

  const [coachStep, setCoachStep] = useState<CoachStep>(
    skipToEdit ? "polish" : "length",
  );
  const [placeConfirmed, setPlaceConfirmed] = useState(skipToEdit);
  const [lengthSetup, setLengthSetup] = useState<LengthSetupValue>({
    lengthMs: 30_000,
    mode: null,
  });

  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeCandidate, setActiveCandidate] = useState<ClipCandidate | null>(
    null,
  );
  const [phaseMsg, setPhaseMsg] = useState("");
  const [encodeProgress, setEncodeProgress] = useState<{
    percent: number;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState<"analyze" | "encode" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [reactionFile, setReactionFile] = useState<File | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null,
  );
  const [placeInitialStartMs, setPlaceInitialStartMs] = useState(0);
  const [momentApplied, setMomentApplied] = useState(false);
  const [polishReadyForContinue, setPolishReadyForContinue] = useState(
    skipToEdit,
  );
  const [silenceBusy, setSilenceBusy] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [polishTab, setPolishTab] = useState<PolishTabId>("effects");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const capability = useMemo(() => detectDeviceCapability(), []);
  const isLg = useIsLg();

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
      const ar = meta.probe.displayWidth / meta.probe.displayHeight;
      const cropNorm = ar < 0.7 ? { x: 0, y: 0, w: 1, h: 1 } : crop;
      const base =
        localSpec?.spec ?? defaultEditSpec(meta.probe.durationMs, cropNorm);
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

      const existingLen = Math.max(
        0,
        base.source.endMs - base.source.startMs,
      );
      if (existingLen > 0) {
        setLengthSetup((v) => ({
          ...v,
          lengthMs: resolveLengthMs(existingLen, meta.probe.durationMs),
        }));
      }

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
  }, [videoUrl, coachStep]);

  useEffect(() => {
    setScrubMs(spec?.source.startMs ?? 0);
  }, [spec?.source.startMs]);

  // Re-cue when entering a step (coachStep only — do not reset on window drag)
  useEffect(() => {
    setDismissedIds(new Set());
    if (coachStep === "place") {
      setPlaceInitialStartMs(history?.present.source.startMs ?? 0);
      setMomentApplied(false);
    }
    if (coachStep === "polish") {
      setPolishReadyForContinue(false);
      const t = window.setTimeout(() => setPolishReadyForContinue(true), 8000);
      return () => window.clearTimeout(t);
    }
    // history snapshot read once on step enter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachStep]);

  // Loop preview inside the locked window while playing (R4).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !spec || !playing) return;
    const onTime = () => {
      if (v.currentTime * 1000 >= spec.source.endMs - 30) {
        v.currentTime = spec.source.startMs / 1000;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [playing, spec]);

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
        const next = normalizeEffects(updater(h.present));
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

  const lockedLength = resolveLengthMs(lengthSetup.lengthMs, durationMs);
  const lengthLabel = `${Math.round(lockedLength / 1000)}s`;

  const applyLockedWindow = useCallback(
    (startMs: number, opts?: { seek?: boolean; refreshCaptions?: boolean }) => {
      const win = clampWindow(startMs, lockedLength, durationMs);
      patch((s) => ({
        ...s,
        source: {
          ...s.source,
          startMs: win.startMs,
          endMs: win.endMs,
        },
        // Sliding the locked box clears silence-refill (window is L again).
        jumpCuts: s.jumpCuts?.enabled
          ? {
              ...s.jumpCuts,
              enabled: false,
              keepRanges: undefined,
              silenceRanges: undefined,
              targetLengthMs: lockedLength,
            }
          : s.jumpCuts,
        captions:
          opts?.refreshCaptions !== false
            ? {
                enabled: s.captions?.enabled ?? true,
                styleId: s.captions?.styleId ?? "bold-white-outline",
                words: captionsForRange(win.startMs, win.endMs),
              }
            : s.captions,
      }));
      if (opts?.seek !== false && videoRef.current) {
        videoRef.current.currentTime = win.startMs / 1000;
      }
      setScrubMs(win.startMs);
    },
    [lockedLength, durationMs, patch, captionsForRange],
  );

  const applyClip = useCallback(
    (c: ClipCandidate) => {
      const win = clampWindow(c.startMs, lockedLength, durationMs);
      const words = captionsForRange(win.startMs, win.endMs);
      patch((s) => ({
        ...s,
        source: {
          ...s.source,
          startMs: win.startMs,
          endMs: win.endMs,
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
      if (videoRef.current) {
        videoRef.current.currentTime = win.startMs / 1000;
      }
    },
    [patch, captionsForRange, lockedLength, durationMs],
  );

  const onLengthSetupChange = (next: LengthSetupValue) => {
    const L = resolveLengthMs(next.lengthMs, durationMs);
    const lengthChanged = L !== lockedLength;
    setLengthSetup({ ...next, lengthMs: L });
    if (lengthChanged) {
      const win = windowFromLength(L, durationMs);
      patch((s) => ({
        ...s,
        source: {
          ...s.source,
          startMs: win.startMs,
          endMs: win.endMs,
        },
        captions: {
          enabled: s.captions?.enabled ?? true,
          styleId: s.captions?.styleId ?? "bold-white-outline",
          words: captionsForRange(win.startMs, win.endMs),
        },
      }));
      setPlaceConfirmed(false);
      if (coachStep !== "length") setCoachStep("length");
    }
  };

  const onSuggest = async (opts: { lengthMs: number }) => {
    if (!sourceFile) return;
    const meta = await getProjectMeta(projectId);
    if (!meta) return;
    setBusy("analyze");
    setSuggestError(null);
    setActiveCandidate(null);
    setMomentApplied(false);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const result = await analyze(sourceFile, {
        probe: meta.probe,
        safariMode: capability.mode === "safari-optimised",
        cores: capability.cores,
        lengthMs: opts.lengthMs,
        topK: 5,
        signal: abortRef.current.signal,
        onProgress: (ev: ProgressEvent) =>
          setPhaseMsg(`${ev.phase}: ${ev.message ?? ""} (${ev.percent}%)`),
      });
      setAnalysis(result);
      await saveAnalysisLocal(projectId, result);

      if (!hasUsableTranscript(result.transcript)) {
        setSuggestError(suggestFailureMessage(result.degradations));
        return;
      }
      if (result.candidates.length === 0) {
        setSuggestError(
          "No strong short moments found for that length. Try another duration or place manually.",
        );
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Suggest failed");
    } finally {
      setBusy(null);
      setPhaseMsg("");
    }
  };

  const runEncode = async () => {
    if (!sourceFile || !spec) return;
    const meta = await getProjectMeta(projectId);
    if (!meta) return;
    setBusy("encode");
    setError(null);
    setDownloadUrl(null);
    setEncodeProgress({ percent: 0, message: "Starting…" });
    try {
      const transcriptItems =
        analysis?.transcript?.words ??
        analysis?.transcript?.segments?.map((s) => ({
          startMs: s.startMs,
          endMs: s.endMs,
        }));
      const result = await encodeEditSpec(
        spec,
        {
          source: sourceFile,
          reaction: reactionFile,
          reactionKind: spec.reaction?.kind ?? "none",
          probe: meta.probe,
          silenceRanges: analysis?.silenceRanges,
          transcriptItems,
        },
        {
          onProgress: (ev: ProgressEvent) => {
            setEncodeProgress({
              percent: ev.percent,
              message: ev.message?.trim() || ev.phase,
            });
            setPhaseMsg(`${ev.phase}: ${ev.message ?? ""} (${ev.percent}%)`);
          },
        },
      );
      const url = URL.createObjectURL(result.blob);
      setDownloadUrl(url);
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
      setEncodeProgress(null);
    }
  };

  const lengthReady = lengthSetup.mode !== null && lockedLength > 0;
  const aiReady =
    lengthSetup.mode === "ai" && (analysis?.candidates?.length ?? 0) > 0;

  const reachable = maxReachableStep(lengthReady, placeConfirmed);

  const nextAction = useMemo(
    () =>
      resolveNextAction(
        {
          step: coachStep,
          lengthMs: lockedLength,
          mode: lengthSetup.mode,
          busy,
          suggestError,
          candidateCount: analysis?.candidates?.length ?? 0,
          momentApplied,
          placeConfirmed,
          windowStartMs: spec?.source.startMs ?? 0,
          initialWindowStartMs: placeInitialStartMs,
          polishReadyForContinue,
          silenceBusy,
          hasDownload: !!downloadUrl,
          encodeError: error,
        },
        { dismissedIds },
      ),
    [
      coachStep,
      lockedLength,
      lengthSetup.mode,
      busy,
      suggestError,
      analysis?.candidates?.length,
      momentApplied,
      placeConfirmed,
      spec?.source.startMs,
      placeInitialStartMs,
      polishReadyForContinue,
      silenceBusy,
      downloadUrl,
      error,
      dismissedIds,
    ],
  );

  const onContinue = () => {
    if (coachStep === "length") {
      if (!lengthReady) return;
      if (lengthSetup.mode === "manual") {
        applyLockedWindow(spec?.source.startMs ?? 0, { refreshCaptions: true });
      }
      setCoachStep("place");
      return;
    }
    if (coachStep === "place") {
      setPlaceConfirmed(true);
      if (!spec?.jumpCuts?.enabled) {
        applyLockedWindow(spec?.source.startMs ?? 0, { refreshCaptions: true });
      }
      setCoachStep("polish");
      return;
    }
    if (coachStep === "polish") {
      setCoachStep("render");
      return;
    }
  };

  let continueDisabled = false;
  let continueReason: string | null = null;
  if (coachStep === "length") {
    continueDisabled = !lengthReady;
    continueReason = !lengthReady
      ? "Pick Place manually or Suggest shorts first."
      : null;
  } else if (coachStep === "place" && lengthSetup.mode === "ai") {
    if (busy === "analyze") {
      continueDisabled = true;
      continueReason = "Still finding moments…";
    } else if (!aiReady && !suggestError) {
      continueDisabled = true;
      continueReason =
        "Run Suggest shorts, or go back and choose Place manually.";
    } else if (aiReady && !momentApplied) {
      continueDisabled = true;
      continueReason = "Pick one suggested moment first.";
    }
  }

  const continueLabel =
    coachStep === "length"
      ? "Continue to place clip"
      : coachStep === "place"
        ? "Confirm this window"
        : coachStep === "polish"
          ? "Continue to render"
          : "Continue";

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

  const showPreview =
    coachStep === "place" ||
    coachStep === "polish" ||
    coachStep === "render";
  const showAside = coachStep === "polish" || coachStep === "render";
  const showTimeline = coachStep === "place" || coachStep === "polish";
  const showRenderControls = coachStep === "render" || coachStep === "polish";

  const candidates = analysis?.candidates ?? [];

  return (
    <div className="space-y-6">
      <EncodeProgressOverlay
        open={busy === "encode"}
        percent={encodeProgress?.percent ?? 0}
        message={encodeProgress?.message ?? "Rendering…"}
      />
      <EditorStepRail
        current={coachStep}
        maxReachable={reachable}
        onSelect={(s) => {
          const idx = COACH_STEP_ORDER.indexOf(s);
          const maxIdx = COACH_STEP_ORDER.indexOf(reachable);
          if (idx <= maxIdx) setCoachStep(s);
        }}
        nextAction={nextAction}
        continueDisabled={continueDisabled || coachStep === "render"}
        continueReason={continueReason}
        continueLabel={continueLabel}
        onContinue={onContinue}
        hideContinue={coachStep === "render"}
        continueInMobileDock
        onDismissCue={() =>
          setDismissedIds((prev) => new Set(prev).add(nextAction.id))
        }
      />

      {coachStep === "length" ? (
        <ClipWizard
          durationMs={durationMs}
          busy={busy === "analyze"}
          phaseMsg={phaseMsg}
          suggestError={suggestError}
          value={lengthSetup}
          onChange={onLengthSetupChange}
          onSuggest={onSuggest}
          emphasizeMode={
            nextAction.id === "pick_mode" ||
            nextAction.id === "recover_manual" ||
            nextAction.id === "retry_or_manual"
          }
        />
      ) : null}

      <div
        className={
          showAside
            ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
            : "grid gap-6"
        }
      >
        <div className="space-y-4">
          {showPreview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>
                  {activeCandidate
                    ? "AI moment"
                    : lengthSetup.mode === "ai"
                      ? "AI place"
                      : "Manual"}
                </span>
                <span>· 1 short</span>
                <span>· {lengthLabel} locked</span>
                <span>· Caps {capOn ? "on" : "off"}</span>
              </div>

              <PreviewStage
                videoUrl={videoUrl}
                spec={spec}
                panes={panes}
                videoRef={videoRef}
                analysisSilence={analysis?.silenceRanges}
                transcriptItems={
                  analysis?.transcript?.words ??
                  analysis?.transcript?.segments?.map((s) => ({
                    startMs: s.startMs,
                    endMs: s.endMs,
                  }))
                }
                selectedOverlayId={selectedOverlayId}
                onOverlayMove={(id, positionNorm) =>
                  patch((s) => ({
                    ...s,
                    textOverlays: (s.textOverlays ?? []).map((o) =>
                      o.id === id ? { ...o, positionNorm } : o,
                    ),
                  }))
                }
                onCropChange={
                  selectedOverlayId
                    ? undefined
                    : (cropNorm) =>
                        patch((s) => ({
                          ...s,
                          source: { ...s.source, cropNorm },
                        }))
                }
              />

              {showAside && !isLg ? (
                <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <PolishMobileTabs
                    value={polishTab}
                    onChange={setPolishTab}
                  />
                  <div className="max-h-[40dvh] space-y-5 overflow-y-auto overscroll-contain">
                    {polishTab === "effects" ? (
                      <EffectsPanel
                        spec={spec}
                        analysis={analysis}
                        sourceFile={sourceFile}
                        durationMs={durationMs}
                        targetLengthMs={lockedLength}
                        selectedOverlayId={selectedOverlayId}
                        onSelectOverlay={setSelectedOverlayId}
                        onSilenceBusyChange={setSilenceBusy}
                        emphasizeDetectSilence={
                          nextAction.target === "effectsDetectSilence" &&
                          nextAction.emphasize
                        }
                        onChange={(next) => {
                          setPolishReadyForContinue(true);
                          setHistory((h) => {
                            if (!h) return h;
                            const normalized = normalizeEffects(next);
                            void persist(normalized);
                            return pushSpec(h, normalized);
                          });
                        }}
                      />
                    ) : null}
                    {polishTab === "captions" ? (
                      <CaptionsPanel
                        enabled={capOn}
                        styleId={styleId}
                        words={spec.captions?.words ?? []}
                        onEnabledChange={(on) =>
                          patch((s) => ({
                            ...s,
                            captions: {
                              enabled: on,
                              styleId:
                                s.captions?.styleId ?? "bold-white-outline",
                              words:
                                s.captions?.words?.length
                                  ? s.captions.words
                                  : captionsForRange(
                                      s.source.startMs,
                                      s.source.endMs,
                                    ),
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
                              styleId:
                                s.captions?.styleId ?? "bold-white-outline",
                              words,
                            },
                          }))
                        }
                      />
                    ) : null}
                    {polishTab === "more" ? (
                      <EditorAsideMore
                        spec={spec}
                        lengthLabel={lengthLabel}
                        pip={pip}
                        reactionFile={reactionFile}
                        activeCandidate={activeCandidate}
                        applyLockedWindow={applyLockedWindow}
                        patch={patch}
                        setReactionFile={setReactionFile}
                        setError={setError}
                        projectId={projectId}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showTimeline ? (
                <SourceTimeline
                  durationMs={durationMs}
                  lengthMs={
                    spec.jumpCuts?.enabled
                      ? Math.max(
                          1000,
                          spec.source.endMs - spec.source.startMs,
                        )
                      : lockedLength
                  }
                  startMs={spec.source.startMs}
                  playheadMs={scrubMs}
                  label={lengthLabel}
                  emphasize={
                    nextAction.target === "timeline" && nextAction.emphasize
                  }
                  onStartMsChange={(start) =>
                    applyLockedWindow(start, { seek: true })
                  }
                  onPlayheadChange={(ms) => {
                    setScrubMs(ms);
                    if (videoRef.current) {
                      videoRef.current.currentTime = ms / 1000;
                    }
                  }}
                />
              ) : null}

              {coachStep === "place" && lengthSetup.mode === "ai" ? (
                <section
                  className={`space-y-3 rounded-2xl border p-4 ${
                    nextAction.target === "momentCard" && nextAction.emphasize
                      ? "border-amber-400/60 ring-2 ring-amber-400/40"
                      : "border-zinc-800"
                  }`}
                  data-coach-target="momentCard"
                >
                  <h3 className="text-sm font-medium text-zinc-200">
                    Suggested moments
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Pick one card to snap the locked {lengthLabel} box (single
                    short). Drag to fine-tune after.
                  </p>
                  {suggestError ? (
                    <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                      {suggestError}
                    </p>
                  ) : null}
                  <ul className="max-h-64 space-y-2 overflow-auto">
                    {candidates.map((c, i) => {
                      const on = activeCandidate?.id === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCandidate(c);
                              setMomentApplied(true);
                              applyClip(c);
                            }}
                            className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                              on
                                ? "border-amber-400/60 bg-amber-400/10"
                                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                            }`}
                          >
                            <div className="flex justify-between gap-2">
                              <span className="font-medium text-zinc-100">
                                Moment {i + 1} ·{" "}
                                {(c.startMs / 1000).toFixed(1)}s–
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
                            <p className="mt-1 text-xs text-zinc-400">
                              {c.reason}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm"
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
                      v.addEventListener(
                        "pause",
                        () => setPlaying(false),
                        { once: true },
                      );
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
                  className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() => setHistory((h) => (h ? undo(h) : h))}
                >
                  Undo
                </button>
                <button
                  type="button"
                  disabled={!canRedo(history)}
                  className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() => setHistory((h) => (h ? redo(h) : h))}
                >
                  Redo
                </button>
                {showRenderControls ? (
                  <>
                    <button
                      type="button"
                      data-coach-target="renderMp4"
                      disabled={busy !== null || !placeConfirmed}
                      className={`hidden min-h-11 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40 lg:inline-flex lg:items-center ${
                        nextAction.target === "renderMp4" &&
                        nextAction.emphasize
                          ? COACH_PULSE_CLASS
                          : ""
                      }`}
                      onClick={() => {
                        setCoachStep("render");
                        setError(null);
                        void runEncode();
                      }}
                    >
                      {nextAction.target === "renderMp4" &&
                      nextAction.emphasize ? (
                        <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 text-[11px] font-bold text-amber-300">
                          1
                        </span>
                      ) : null}
                      {busy === "encode" ? "Rendering…" : "Render MP4"}
                    </button>
                    {downloadUrl ? (
                      <a
                        href={downloadUrl}
                        download
                        data-coach-target="download"
                        className={`hidden min-h-11 items-center rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 lg:inline-flex ${
                          nextAction.target === "download" &&
                          nextAction.emphasize
                            ? COACH_PULSE_CLASS
                            : ""
                        }`}
                      >
                        Download again
                      </a>
                    ) : null}
                  </>
                ) : null}
              </div>

              {coachStep === "render" &&
              (nextAction.target === "renderMp4" ||
                nextAction.target === "download") ? (
                <CoachCue
                  title={nextAction.title}
                  body={nextAction.body}
                  emphasize={nextAction.emphasize}
                  onDismiss={() =>
                    setDismissedIds((prev) => new Set(prev).add(nextAction.id))
                  }
                />
              ) : null}

              {coachStep === "render" ? (
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
                      if (videoRef.current) {
                        videoRef.current.currentTime = ms / 1000;
                      }
                    }}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {phaseMsg && busy !== "encode" ? (
            <p className="text-xs text-zinc-400">{phaseMsg}</p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
        </div>

        {showAside && isLg ? (
          <aside className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <EffectsPanel
              spec={spec}
              analysis={analysis}
              sourceFile={sourceFile}
              durationMs={durationMs}
              targetLengthMs={lockedLength}
              selectedOverlayId={selectedOverlayId}
              onSelectOverlay={setSelectedOverlayId}
              onSilenceBusyChange={setSilenceBusy}
              emphasizeDetectSilence={
                nextAction.target === "effectsDetectSilence" &&
                nextAction.emphasize
              }
              onChange={(next) => {
                setPolishReadyForContinue(true);
                setHistory((h) => {
                  if (!h) return h;
                  const normalized = normalizeEffects(next);
                  void persist(normalized);
                  return pushSpec(h, normalized);
                });
              }}
            />

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

            <EditorAsideMore
              spec={spec}
              lengthLabel={lengthLabel}
              pip={pip}
              reactionFile={reactionFile}
              activeCandidate={activeCandidate}
              applyLockedWindow={applyLockedWindow}
              patch={patch}
              setReactionFile={setReactionFile}
              setError={setError}
              projectId={projectId}
            />
          </aside>
        ) : null}
      </div>

      <MobileActionDock
        mode={
          coachStep === "render"
            ? "render"
            : coachStep === "length" ||
                coachStep === "place" ||
                coachStep === "polish"
              ? "continue"
              : "none"
        }
        continueLabel={continueLabel}
        continueDisabled={continueDisabled || coachStep === "render"}
        continueReason={continueReason}
        pulseContinue={
          nextAction.target === "continue" &&
          nextAction.emphasize &&
          !continueDisabled
        }
        onContinue={onContinue}
        renderDisabled={busy !== null || !placeConfirmed}
        pulseRender={
          nextAction.target === "renderMp4" && nextAction.emphasize
        }
        rendering={busy === "encode"}
        onRender={() => {
          setCoachStep("render");
          setError(null);
          void runEncode();
        }}
        downloadUrl={downloadUrl}
        pulseDownload={
          nextAction.target === "download" && nextAction.emphasize
        }
      />
    </div>
  );
}
