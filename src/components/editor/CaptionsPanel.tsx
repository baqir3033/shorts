"use client";

import type { CaptionStyleId, TimedWord } from "@/media/edit-spec/types";
import { groupWordsIntoCards } from "@/media/analysis/captions/groupCards";

const STYLES: { id: CaptionStyleId; label: string; hint: string }[] = [
  {
    id: "bold-white-outline",
    label: "White outline",
    hint: "Classic bold white + black stroke",
  },
  {
    id: "bold-yellow-black",
    label: "Yellow box",
    hint: "Yellow word on black highlight",
  },
  {
    id: "word-by-word-pop",
    label: "Pop",
    hint: "Active word scales up",
  },
];

type Props = {
  enabled: boolean;
  styleId: CaptionStyleId;
  words: TimedWord[];
  onEnabledChange: (on: boolean) => void;
  onStyleChange: (id: CaptionStyleId) => void;
  onWordsChange: (words: TimedWord[]) => void;
};

export function CaptionsPanel({
  enabled,
  styleId,
  words,
  onEnabledChange,
  onStyleChange,
  onWordsChange,
}: Props) {
  const cards = groupWordsIntoCards(words);

  const updateWordText = (globalIndex: number, text: string) => {
    const next = words.map((w, i) => (i === globalIndex ? { ...w, text } : w));
    onWordsChange(next);
  };

  const removeWord = (globalIndex: number) => {
    onWordsChange(words.filter((_, i) => i !== globalIndex));
  };

  // Map card-local word index → global index
  let cursor = 0;
  const cardRanges = cards.map((c) => {
    const start = cursor;
    cursor += c.words.length;
    return { start, end: cursor };
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Captions</h2>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          {enabled ? "On" : "Off"}
        </label>
      </div>

      {!enabled ? (
        <p className="text-xs text-zinc-500">
          Turn on for karaoke burn-in. Words come from speech recognition for
          this clip.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                className={`rounded-lg px-2.5 py-1.5 text-xs ${
                  styleId === s.id
                    ? "bg-amber-400 font-semibold text-zinc-950"
                    : "border border-zinc-700 text-zinc-200"
                }`}
                onClick={() => onStyleChange(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {words.length === 0 ? (
            <p className="text-xs text-amber-200/90">
              No timed words for this range — run Suggest or pick a clip with
              clear speech.
            </p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-auto text-xs">
              {cards.map((card, ci) => {
                const range = cardRanges[ci];
                return (
                  <li
                    key={card.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2"
                  >
                    <div className="mb-1 text-[10px] text-zinc-500">
                      {(card.startMs / 1000).toFixed(1)}s–
                      {(card.endMs / 1000).toFixed(1)}s
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {card.words.map((w, wi) => {
                        const gi = range.start + wi;
                        return (
                          <span
                            key={`${gi}-${w.startMs}`}
                            className="inline-flex items-center gap-0.5"
                          >
                            <input
                              value={w.text}
                              className={`w-16 rounded border bg-zinc-950 px-1 py-0.5 text-zinc-100 ${
                                w.emphasis
                                  ? "border-amber-400/60"
                                  : "border-zinc-700"
                              }`}
                              onChange={(e) =>
                                updateWordText(gi, e.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="text-zinc-600 hover:text-red-300"
                              title="Remove word"
                              onClick={() => removeWord(gi)}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
