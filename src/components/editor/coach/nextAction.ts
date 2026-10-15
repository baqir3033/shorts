export type CoachStep = "length" | "place" | "polish" | "render";

export type CoachTarget =
  | "continue"
  | "placeManual"
  | "suggest"
  | "timeline"
  | "momentCard"
  | "effectsDetectSilence"
  | "renderMp4"
  | "download"
  | "none";

export type CoachSnapshot = {
  step: CoachStep;
  lengthMs: number;
  mode: "manual" | "ai" | null;
  busy: "analyze" | "encode" | null;
  suggestError: string | null;
  candidateCount: number;
  /** AI moment applied on this Place visit */
  momentApplied: boolean;
  placeConfirmed: boolean;
  windowStartMs: number;
  initialWindowStartMs: number;
  /** User dismissed explore_effects or edited effects / timer elapsed */
  polishReadyForContinue: boolean;
  silenceBusy: boolean;
  hasDownload: boolean;
  encodeError: string | null;
};

export type NextAction = {
  id: string;
  title: string;
  body: string;
  target: CoachTarget;
  emphasize: boolean;
};

export type ResolveOpts = {
  dismissedIds?: ReadonlySet<string>;
};

function action(
  partial: NextAction,
  dismissed?: ReadonlySet<string>,
): NextAction {
  if (dismissed?.has(partial.id) && partial.emphasize) {
    return { ...partial, emphasize: false };
  }
  return partial;
}

export function resolveNextAction(
  snap: CoachSnapshot,
  opts?: ResolveOpts,
): NextAction {
  const d = opts?.dismissedIds;

  if (snap.busy === "analyze") {
    return action(
      {
        id: "wait_suggest",
        title: "Finding moments…",
        body: "Speech AI is scanning the video. This can take a minute.",
        target: "none",
        emphasize: false,
      },
      d,
    );
  }

  if (snap.busy === "encode") {
    return action(
      {
        id: "wait_encode",
        title: "Rendering…",
        body: "Encoding your short in the browser. Keep this tab open.",
        target: "none",
        emphasize: false,
      },
      d,
    );
  }

  if (snap.silenceBusy) {
    return action(
      {
        id: "wait_silence",
        title: "Detecting silence…",
        body: "Analyzing audio to cut quiet gaps and refill to your length.",
        target: "none",
        emphasize: false,
      },
      d,
    );
  }

  switch (snap.step) {
    case "length":
      return resolveLength(snap, d);
    case "place":
      return resolvePlace(snap, d);
    case "polish":
      return resolvePolish(snap, d);
    case "render":
      return resolveRender(snap, d);
    default:
      return {
        id: "none",
        title: "",
        body: "",
        target: "none",
        emphasize: false,
      };
  }
}

function resolveLength(
  snap: CoachSnapshot,
  d?: ReadonlySet<string>,
): NextAction {
  if (!snap.mode) {
    return action(
      {
        id: "pick_mode",
        title: "Choose how to place the short",
        body: "Tap Place manually to slide the box yourself, or Suggest shorts for AI moments.",
        target: "placeManual",
        emphasize: true,
      },
      d,
    );
  }

  if (snap.mode === "manual") {
    return action(
      {
        id: "continue_place",
        title: "Press Continue to place clip",
        body: "Length is set. Continue to drag the locked window on the full video.",
        target: "continue",
        emphasize: true,
      },
      d,
    );
  }

  // AI mode
  if (snap.suggestError) {
    return action(
      {
        id: "recover_manual",
        title: "Try Place manually",
        body: "Suggest failed. Place manually still works — or retry Suggest shorts.",
        target: "placeManual",
        emphasize: true,
      },
      d,
    );
  }

  if (snap.candidateCount > 0) {
    return action(
      {
        id: "continue_place",
        title: "Press Continue to place clip",
        body: "Moments are ready. Continue to pick one and fine-tune the locked box.",
        target: "continue",
        emphasize: true,
      },
      d,
    );
  }

  return action(
    {
      id: "retry_or_manual",
      title: "Run Suggest shorts again",
      body: "No moments yet. Retry Suggest, or switch to Place manually.",
      target: "suggest",
      emphasize: true,
    },
    d,
  );
}

function resolvePlace(
  snap: CoachSnapshot,
  d?: ReadonlySet<string>,
): NextAction {
  if (snap.mode === "ai") {
    if (snap.candidateCount === 0) {
      return action(
        {
          id: "place_no_candidates",
          title: "Drag the amber box, then confirm",
          body: "No AI moments available. Place manually on the timeline, then confirm.",
          target: "timeline",
          emphasize: true,
        },
        d,
      );
    }
    if (!snap.momentApplied) {
      return action(
        {
          id: "pick_moment",
          title: "Pick one suggested moment",
          body: "Tap a card to snap the locked window — only one short is active.",
          target: "momentCard",
          emphasize: true,
        },
        d,
      );
    }
    return action(
      {
        id: "confirm_window",
        title: "Press Confirm this window",
        body: "Fine-tune by dragging if needed, then confirm to polish.",
        target: "continue",
        emphasize: true,
      },
      d,
    );
  }

  // Manual
  const moved = snap.windowStartMs !== snap.initialWindowStartMs;
  if (!moved) {
    return action(
      {
        id: "drag_timeline",
        title: "Drag the amber box",
        body: `Slide the locked ${Math.round(snap.lengthMs / 1000)}s selection along the full video.`,
        target: "timeline",
        emphasize: true,
      },
      d,
    );
  }

  return action(
    {
      id: "confirm_window",
      title: "Press Confirm this window",
      body: "When the selection looks right, confirm to continue to effects.",
      target: "continue",
      emphasize: true,
    },
    d,
  );
}

function resolvePolish(
  snap: CoachSnapshot,
  d?: ReadonlySet<string>,
): NextAction {
  if (!snap.polishReadyForContinue) {
    return action(
      {
        id: "explore_effects",
        title: "Optional: try Effects",
        body: "Look, speed, silence cut, captions, or reaction — or skip and continue.",
        target: "effectsDetectSilence",
        emphasize: true,
      },
      d,
    );
  }

  return action(
    {
      id: "continue_render",
      title: "Press Continue to render",
      body: "When the preview looks good, continue to export.",
      target: "continue",
      emphasize: true,
    },
    d,
  );
}

function resolveRender(
  snap: CoachSnapshot,
  d?: ReadonlySet<string>,
): NextAction {
  if (snap.encodeError) {
    return action(
      {
        id: "retry_render",
        title: "Press Render MP4 to retry",
        body: "Last export failed. Fix any issues, then render again.",
        target: "renderMp4",
        emphasize: true,
      },
      d,
    );
  }

  if (snap.hasDownload) {
    return action(
      {
        id: "download_again",
        title: "Download your short",
        body: "Export finished. Download again if you need another copy.",
        target: "download",
        emphasize: true,
      },
      d,
    );
  }

  return action(
    {
      id: "render_mp4",
      title: "Press Render MP4 to export",
      body: "Burns captions, effects, and your locked window into a 9:16 MP4.",
      target: "renderMp4",
      emphasize: true,
    },
    d,
  );
}
