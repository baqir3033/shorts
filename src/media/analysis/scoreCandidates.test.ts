import { describe, expect, it } from "vitest";
import { hasUsableTranscript, scoreCandidates } from "./scoreCandidates";
import { findShortsMoments } from "./shortsBrain/shortsScore";

function makeTalkingHeadWords() {
  // Scripted beats: weak open → strong hook → substance → punchline → filler → second hook
  const script: { t: number; text: string }[] = [
    { t: 0, text: "Um so yeah today I wanted to chat a little bit" },
    { t: 8_000, text: "Wait nobody talks about this mistake" },
    {
      t: 12_000,
      text: "Here is why it actually matters for creators who post every day",
    },
    {
      t: 22_000,
      text: "Stop doing the old method forever. The truth is simple once you see it.",
    },
    { t: 35_000, text: "And uh you know like basically whatever" },
    { t: 50_000, text: "But the biggest tip is this exact workflow" },
    {
      t: 56_000,
      text: "Do this once and your retention jumps. That's why it works.",
    },
    { t: 80_000, text: "Anyway thanks for watching smash like" },
    {
      t: 95_000,
      text: "What if you never edited this way again? Here's the thing that changes everything.",
    },
    {
      t: 105_000,
      text: "The result is a short that actually lands. Period.",
    },
  ];

  const words: { startMs: number; endMs: number; text: string }[] = [];
  for (const line of script) {
    let t = line.t;
    for (const w of line.text.split(/\s+/)) {
      words.push({ startMs: t, endMs: t + 220, text: w });
      t += 240;
    }
  }
  return words;
}

describe("scoreCandidates / shorts brain", () => {
  it("prefers hook/payoff moments over filler and never reasons about zoom", () => {
    const words = makeTalkingHeadWords();
    const result = scoreCandidates({
      durationMs: 120_000,
      upright: { w: 1920, h: 1080 },
      scenes: [{ tMs: 20_000, score: 0.8 }],
      faces: [
        // Face samples used to trigger zoom-AI — must be ignored
        {
          tMs: 10_000,
          boxesNorm: [{ x: 0.4, y: 0.3, w: 0.15, h: 0.25 }],
          primary: { x: 0.4, y: 0.3, w: 0.15, h: 0.25 },
        },
      ],
      transcript: { segments: [], words },
      lengthsMs: [30_000],
      topK: 3,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result[0].quote?.toLowerCase()).toMatch(
      /wait|nobody|mistake|biggest|tip|what if|never|truth|stop/i,
    );
    expect(result[0].reason.toLowerCase()).not.toContain("zoom");
    // Widest-fit crop for 16:9 → 9:16 is ~0.32 wide, not a tight face box
    expect(result[0].cropNorm.w).toBeGreaterThan(0.25);
    expect(result[0].cropNorm.w).toBeLessThan(0.45);
  });

  it("ranks hook windows above filler windows", () => {
    const words = makeTalkingHeadWords();
    const ranked = findShortsMoments({
      durationMs: 120_000,
      upright: { w: 1920, h: 1080 },
      lengthMs: 30_000,
      topK: 8,
      transcript: { words },
      scenes: [],
      faces: [],
    });
    expect(ranked.length).toBeGreaterThan(0);
    const top3 = ranked.slice(0, 3).map((c) => c.quote.toLowerCase());
    expect(top3.join(" | ")).not.toMatch(/smash like|thanks for watching/);
    expect(top3.some((q) => /wait|nobody|biggest|what if|truth|stop/i.test(q))).toBe(
      true,
    );
  });

  it("returns empty without usable transcript", () => {
    expect(
      scoreCandidates({
        durationMs: 60_000,
        upright: { w: 1080, h: 1920 },
        scenes: [],
        faces: [],
        lengthsMs: [30_000],
        topK: 3,
      }),
    ).toEqual([]);
    expect(hasUsableTranscript(undefined)).toBe(false);
  });
});
