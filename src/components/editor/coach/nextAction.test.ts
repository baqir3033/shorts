import { describe, expect, it } from "vitest";
import {
  resolveNextAction,
  type CoachSnapshot,
} from "./nextAction";

const base: CoachSnapshot = {
  step: "length",
  lengthMs: 30_000,
  mode: null,
  busy: null,
  suggestError: null,
  candidateCount: 0,
  momentApplied: false,
  placeConfirmed: false,
  windowStartMs: 0,
  initialWindowStartMs: 0,
  polishReadyForContinue: false,
  silenceBusy: false,
  hasDownload: false,
  encodeError: null,
};

describe("resolveNextAction", () => {
  it("length: pick mode when no mode", () => {
    const a = resolveNextAction(base);
    expect(a.id).toBe("pick_mode");
    expect(a.target).toBe("placeManual");
  });

  it("length: continue after manual", () => {
    const a = resolveNextAction({ ...base, mode: "manual" });
    expect(a.id).toBe("continue_place");
    expect(a.target).toBe("continue");
    expect(a.emphasize).toBe(true);
  });

  it("length: wait while analyzing", () => {
    const a = resolveNextAction({
      ...base,
      mode: "ai",
      busy: "analyze",
    });
    expect(a.id).toBe("wait_suggest");
    expect(a.emphasize).toBe(false);
  });

  it("length: recover on suggest error", () => {
    const a = resolveNextAction({
      ...base,
      mode: "ai",
      suggestError: "fail",
    });
    expect(a.id).toBe("recover_manual");
  });

  it("length: continue when candidates ready", () => {
    const a = resolveNextAction({
      ...base,
      mode: "ai",
      candidateCount: 3,
    });
    expect(a.id).toBe("continue_place");
  });

  it("place manual: drag then confirm", () => {
    const drag = resolveNextAction({
      ...base,
      step: "place",
      mode: "manual",
      windowStartMs: 0,
      initialWindowStartMs: 0,
    });
    expect(drag.id).toBe("drag_timeline");
    const conf = resolveNextAction({
      ...base,
      step: "place",
      mode: "manual",
      windowStartMs: 5_000,
      initialWindowStartMs: 0,
    });
    expect(conf.id).toBe("confirm_window");
  });

  it("place ai: pick moment then confirm", () => {
    const pick = resolveNextAction({
      ...base,
      step: "place",
      mode: "ai",
      candidateCount: 4,
      momentApplied: false,
    });
    expect(pick.id).toBe("pick_moment");
    const conf = resolveNextAction({
      ...base,
      step: "place",
      mode: "ai",
      candidateCount: 4,
      momentApplied: true,
    });
    expect(conf.id).toBe("confirm_window");
  });

  it("polish: explore then continue", () => {
    const explore = resolveNextAction({ ...base, step: "polish" });
    expect(explore.id).toBe("explore_effects");
    const cont = resolveNextAction({
      ...base,
      step: "polish",
      polishReadyForContinue: true,
    });
    expect(cont.id).toBe("continue_render");
  });

  it("render: render / download / retry", () => {
    expect(resolveNextAction({ ...base, step: "render" }).id).toBe(
      "render_mp4",
    );
    expect(
      resolveNextAction({ ...base, step: "render", hasDownload: true }).id,
    ).toBe("download_again");
    expect(
      resolveNextAction({
        ...base,
        step: "render",
        encodeError: "boom",
      }).id,
    ).toBe("retry_render");
  });

  it("soft-dismiss clears emphasize", () => {
    const a = resolveNextAction(
      { ...base, mode: "manual" },
      { dismissedIds: new Set(["continue_place"]) },
    );
    expect(a.id).toBe("continue_place");
    expect(a.emphasize).toBe(false);
  });

  it("encode busy wait", () => {
    const a = resolveNextAction({
      ...base,
      step: "render",
      busy: "encode",
    });
    expect(a.id).toBe("wait_encode");
  });
});
