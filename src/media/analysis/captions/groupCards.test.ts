import { describe, expect, it } from "vitest";
import { groupWordsIntoCards, sliceWordsToClip } from "./groupCards";

describe("groupWordsIntoCards", () => {
  it("groups into 2–4 word cards at punctuation", () => {
    const words = [
      { text: "Wait", startMs: 0, endMs: 200 },
      { text: "nobody", startMs: 220, endMs: 400 },
      { text: "talks", startMs: 420, endMs: 600 },
      { text: "about", startMs: 620, endMs: 800 },
      { text: "this.", startMs: 820, endMs: 1000 },
      { text: "Stop", startMs: 1400, endMs: 1600 },
      { text: "now.", startMs: 1620, endMs: 1800 },
    ];
    const cards = groupWordsIntoCards(words);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.every((c) => c.words.length >= 1 && c.words.length <= 4)).toBe(
      true,
    );
    expect(cards[0].text.toLowerCase()).toContain("wait");
  });
});

describe("sliceWordsToClip", () => {
  it("shifts absolute words to clip-relative", () => {
    const words = [
      { text: "a", startMs: 10_000, endMs: 10_200 },
      { text: "b", startMs: 10_300, endMs: 10_500 },
      { text: "c", startMs: 20_000, endMs: 20_200 },
    ];
    const sliced = sliceWordsToClip(words, 10_000, 15_000);
    expect(sliced).toHaveLength(2);
    expect(sliced[0].startMs).toBe(0);
    expect(sliced[1].startMs).toBe(300);
  });
});
