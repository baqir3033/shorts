"use client";

import { COACH_PULSE_CLASS } from "./coach/CoachCue";

type Mode = "continue" | "render" | "none";

type Props = {
  mode: Mode;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueReason?: string | null;
  pulseContinue?: boolean;
  onContinue?: () => void;
  renderDisabled?: boolean;
  pulseRender?: boolean;
  rendering?: boolean;
  onRender?: () => void;
  downloadUrl?: string | null;
  pulseDownload?: boolean;
};

export function MobileActionDock({
  mode,
  continueLabel = "Continue",
  continueDisabled,
  continueReason,
  pulseContinue,
  onContinue,
  renderDisabled,
  pulseRender,
  rendering,
  onRender,
  downloadUrl,
  pulseDownload,
}: Props) {
  if (mode === "none") return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-3 pt-3 backdrop-blur lg:hidden"
      style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
        {mode === "continue" && onContinue ? (
          <>
            <button
              type="button"
              data-coach-target="continue"
              disabled={!!continueDisabled}
              onClick={onContinue}
              className={`flex min-h-11 w-full items-center justify-center rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40 ${
                pulseContinue ? COACH_PULSE_CLASS : ""
              }`}
            >
              {pulseContinue ? (
                <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 text-[11px] font-bold text-amber-300">
                  1
                </span>
              ) : null}
              {continueLabel}
            </button>
            {continueReason ? (
              <p className="text-center text-xs text-zinc-500">
                {continueReason}
              </p>
            ) : null}
          </>
        ) : null}

        {mode === "render" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-coach-target="renderMp4"
              disabled={!!renderDisabled}
              onClick={onRender}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-xl bg-amber-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40 ${
                pulseRender ? COACH_PULSE_CLASS : ""
              }`}
            >
              {pulseRender ? (
                <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 text-[11px] font-bold text-amber-300">
                  1
                </span>
              ) : null}
              {rendering ? "Rendering…" : "Render MP4"}
            </button>
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download
                data-coach-target="download"
                className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 text-sm text-emerald-200 ${
                  pulseDownload ? COACH_PULSE_CLASS : ""
                }`}
              >
                Download again
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
