"use client";

type Props = {
  title: string;
  body?: string;
  emphasize?: boolean;
  onDismiss?: () => void;
  className?: string;
};

/** Badge (1) + message; optional pulse wrapper for primary CTAs. */
export function CoachCue({
  title,
  body,
  emphasize,
  onDismiss,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-wrap items-start gap-2 text-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
          emphasize
            ? "bg-amber-400 text-zinc-950"
            : "bg-zinc-700 text-zinc-200"
        }`}
      >
        1
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`font-medium ${
            emphasize ? "text-amber-100" : "text-zinc-200"
          }`}
        >
          {title}
        </p>
        {body ? (
          <p className="mt-0.5 text-xs text-zinc-400">{body}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          onClick={onDismiss}
          aria-label="Dismiss tip"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export const COACH_PULSE_CLASS =
  "relative animate-pulse shadow-[0_0_0_3px_rgba(251,191,36,0.55)] ring-2 ring-amber-300 ring-offset-2 ring-offset-zinc-950";
