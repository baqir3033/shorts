import { describe, expect, it } from "vitest";
import { resolveAnaphora } from "./anaphora";
import type { Utterance } from "./momentFinders";

describe("resolveAnaphora", () => {
  it("extends window backward when opening with unresolved pronoun", () => {
    const utterances: Utterance[] = [
      {
        startMs: 0,
        endMs: 3000,
        text: "Creators waste hours on the wrong edit method.",
      },
      {
        startMs: 3200,
        endMs: 6000,
        text: "That is why retention collapses overnight.",
      },
      {
        startMs: 6500,
        endMs: 9000,
        text: "Stop doing it forever.",
      },
    ];
    const fix = resolveAnaphora({
      utterances,
      startMs: 3200,
      endMs: 32_000,
      lengthMs: 30_000,
      durationMs: 60_000,
    });
    expect(fix.extended || fix.startMs < 3200).toBe(true);
    expect(fix.unresolved).toBe(false);
  });

  it("does not penalize clean hook opens", () => {
    const utterances: Utterance[] = [
      {
        startMs: 10_000,
        endMs: 13_000,
        text: "Wait nobody talks about this mistake.",
      },
    ];
    const fix = resolveAnaphora({
      utterances,
      startMs: 10_000,
      endMs: 40_000,
      lengthMs: 30_000,
      durationMs: 60_000,
    });
    expect(fix.penalty).toBe(0);
    expect(fix.unresolved).toBe(false);
  });
});
