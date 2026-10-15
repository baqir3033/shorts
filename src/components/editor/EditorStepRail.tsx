"use client";

import { useEffect, useRef } from "react";
import { CoachCue, COACH_PULSE_CLASS } from "./coach/CoachCue";
import type { CoachStep, NextAction } from "./coach/nextAction";

const STEPS: { id: CoachStep; title: string }[] = [
  { id: "length", title: "Length" },
  { id: "place", title: "Place clip" },
  { id: "polish", title: "Polish" },
  { id: "render", title: "Render" },
];

const ORDER: CoachStep[] = ["length", "place", "polish", "render"];

type Props = {
  current: CoachStep;
  maxReachable: CoachStep;
  onSelect: (step: CoachStep) => void;
  nextAction: NextAction;
  continueDisabled?: boolean;
  continueReason?: string | null;
  continueLabel?: string;
  onContinue?: () => void;
  hideContinue?: boolean;
  /** When true, Continue lives in MobileActionDock on <lg; keep rail CTA for desktop only. */
  continueInMobileDock?: boolean;
  onDismissCue?: () => void;
};

function stepIndex(s: CoachStep): number {
  return ORDER.indexOf(s);
}

export function EditorStepRail({
  current,
  maxReachable,
  onSelect,
  nextAction,
  continueDisabled,
  continueReason,
  continueLabel = "Continue",
  onContinue,
  hideContinue,
  continueInMobileDock,
  onDismissCue,
}: Props) {
  const maxIdx = stepIndex(maxReachable);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const pulseContinue =
    nextAction.target === "continue" &&
    nextAction.emphasize &&
    !continueDisabled;

  useEffect(() => {
    if (!pulseContinue) return;
    const targets = document.querySelectorAll<HTMLElement>(
      '[data-coach-target="continue"]',
    );
    const visible =
      [...targets].find((el) => el.offsetParent !== null) ??
      continueRef.current;
    visible?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [pulseContinue, nextAction.id]);

  return (
    <div className="sticky top-0 z-20 -mx-3 space-y-3 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/90 md:-mx-0 md:rounded-2xl md:border md:border-zinc-800 md:px-4 md:py-4">
      <ol className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const isPast = stepIndex(current) > i;
          const reachable = i <= maxIdx;
          return (
            <li key={s.id} className="snap-start shrink-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(s.id)}
                className={`inline-flex min-h-11 items-center rounded-full px-3.5 py-2 text-xs font-medium uppercase tracking-wide transition sm:text-[11px] ${
                  isCurrent
                    ? "bg-amber-400 font-semibold text-zinc-950"
                    : isPast
                      ? "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                      : reachable
                        ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        : "bg-zinc-900 text-zinc-600"
                } disabled:cursor-not-allowed`}
              >
                {isPast ? "✓ " : `${i + 1}. `}
                {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <CoachCue
        title={nextAction.title || STEPS.find((s) => s.id === current)!.title}
        body={nextAction.body}
        emphasize={nextAction.emphasize && nextAction.target !== "none"}
        onDismiss={
          nextAction.emphasize && nextAction.target !== "none"
            ? onDismissCue
            : undefined
        }
      />

      {!hideContinue && onContinue ? (
        <div
          className={`flex flex-wrap items-center gap-3 ${
            continueInMobileDock ? "hidden lg:flex" : ""
          }`}
        >
          <button
            ref={continueRef}
            type="button"
            data-coach-target="continue"
            disabled={!!continueDisabled}
            onClick={onContinue}
            aria-describedby="coach-continue-desc"
            className={`min-h-11 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40 ${
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
          <span id="coach-continue-desc" className="sr-only">
            {nextAction.body}
          </span>
          {continueDisabled && continueReason ? (
            <span className="text-xs text-zinc-500">{continueReason}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { ORDER as COACH_STEP_ORDER };
export type { CoachStep };
