"use client";

type Props = {
  value: number;
  size?: "thin" | "thick";
  label?: string;
  indeterminate?: boolean;
  className?: string;
};

export function ProgressBar({
  value,
  size = "thick",
  label,
  indeterminate = false,
  className = "",
}: Props) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const trackH = size === "thick" ? "h-3.5 sm:h-4" : "h-2";

  return (
    <div className={`w-full ${className}`}>
      {label ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm text-zinc-300">{label}</span>
          <span className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-amber-300 sm:text-3xl">
            {Math.round(clamped)}%
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className={`relative w-full overflow-hidden rounded-full bg-zinc-800 ${trackH}`}
      >
        <div
          className={`h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out ${
            indeterminate ? "animate-pulse" : ""
          }`}
          style={{ width: `${clamped}%` }}
        />
        {indeterminate ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-amber-200/20 to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
}
