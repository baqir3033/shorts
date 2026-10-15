"use client";

export type CoachStep = "length" | "place" | "polish" | "render";

const STEPS: {
  id: CoachStep;
  title: string;
  coach: (ctx: { lengthLabel: string }) => string;
}[] = [
  {
    id: "length",
    title: "Length",
    coach: () => "Choose how long each short is.",
  },
  {
    id: "place",
    title: "Place clip",
    coach: ({ lengthLabel }) =>
      `Drag the highlighted box to the ${lengthLabel} you want. Length stays fixed.`,
  },
  {
    id: "polish",
    title: "Polish",
    coach: () =>
      "Effects (look, speed, fades), captions, reaction PiP, and crop — optional but recommended.",
  },
  {
    id: "render",
    title: "Render",
    coach: () => "Export when the preview looks right.",
  },
];

const ORDER: CoachStep[] = ["length", "place", "polish", "render"];

type Props = {
  current: CoachStep;
  lengthLabel: string;
  /** Highest step the user may open (inclusive index in ORDER). */
  maxReachable: CoachStep;
  onSelect: (step: CoachStep) => void;
  continueDisabled?: boolean;
  continueReason?: string | null;
  continueLabel?: string;
  onContinue?: () => void;
  hideContinue?: boolean;
};

function stepIndex(s: CoachStep): number {
  return ORDER.indexOf(s);
}

export function EditorStepRail({
  current,
  lengthLabel,
  maxReachable,
  onSelect,
  continueDisabled,
  continueReason,
  continueLabel = "Continue",
  onContinue,
  hideContinue,
}: Props) {
  const currentMeta = STEPS.find((s) => s.id === current)!;
  const maxIdx = stepIndex(maxReachable);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const isPast = stepIndex(current) > i;
          const reachable = i <= maxIdx;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(s.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition ${
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

      <p className="text-sm text-zinc-300">
        <span className="font-medium text-zinc-100">
          {currentMeta.title}:{" "}
        </span>
        {currentMeta.coach({ lengthLabel })}
      </p>

      {!hideContinue && onContinue ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!!continueDisabled}
            onClick={onContinue}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            {continueLabel}
          </button>
          {continueDisabled && continueReason ? (
            <span className="text-xs text-zinc-500">{continueReason}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { ORDER as COACH_STEP_ORDER };
