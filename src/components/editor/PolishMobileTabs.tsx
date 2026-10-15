"use client";

export type PolishTabId = "effects" | "captions" | "more";

const TABS: { id: PolishTabId; label: string }[] = [
  { id: "effects", label: "Effects" },
  { id: "captions", label: "Captions" },
  { id: "more", label: "More" },
];

type Props = {
  value: PolishTabId;
  onChange: (id: PolishTabId) => void;
  className?: string;
};

export function PolishMobileTabs({ value, onChange, className = "" }: Props) {
  return (
    <div
      className={`flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1 ${className}`}
      role="tablist"
      aria-label="Polish tools"
    >
      {TABS.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition ${
              on
                ? "bg-amber-400 text-zinc-950"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
