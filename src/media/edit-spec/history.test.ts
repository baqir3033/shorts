import { describe, expect, it } from "vitest";
import { defaultEditSpec } from "./schema";
import {
  canRedo,
  canUndo,
  createHistory,
  pushSpec,
  redo,
  undo,
} from "./history";

describe("editor history", () => {
  it("supports undo/redo", () => {
    const base = defaultEditSpec(10_000, { x: 0, y: 0, w: 1, h: 1 });
    expect(base.layout.type).toBe("pip");
    let h = createHistory(base);
    expect(canUndo(h)).toBe(false);

    h = pushSpec(h, {
      ...base,
      source: { ...base.source, startMs: 1000 },
    });
    expect(canUndo(h)).toBe(true);
    expect(h.present.source.startMs).toBe(1000);

    h = undo(h);
    expect(h.present.source.startMs).toBe(0);
    expect(canRedo(h)).toBe(true);

    h = redo(h);
    expect(h.present.source.startMs).toBe(1000);
  });
});
