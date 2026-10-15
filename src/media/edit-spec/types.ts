import type { ProbeResult } from "@/media/ingest/types";

export type Box = { x: number; y: number; w: number; h: number };

export type TimedWord = {
  startMs: number;
  endMs: number;
  text: string;
  /** Smart-emphasis flag for karaoke burn-in / preview */
  emphasis?: boolean;
};

export type LayoutSpec =
  | { type: "split_vertical"; primaryRatio: number }
  | {
      type: "split_horizontal";
      primaryRatio: number;
      primaryOn: "top" | "bottom";
    }
  | {
      type: "pip";
      anchor: "tl" | "tr" | "bl" | "br";
      sizePercent: number;
      marginPx: number;
      fit?: "cover" | "contain";
    };

export type TextOverlay = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  positionNorm: { x: number; y: number };
  fontSize: number;
  fontFamily: "bold" | "mono" | "handwritten";
  color: string;
  bgColor?: string;
  animation: "none" | "pop" | "slide_up";
};

export type SpeedSegment = {
  startMs: number;
  endMs: number;
  rate: number;
};

export type TransitionSpec = {
  afterSegmentIndex: number;
  type: "none" | "dissolve" | "fade_black" | "swipe_left";
  durationMs: number;
};

export type LookPresetId =
  | "none"
  | "vivid"
  | "warm"
  | "cool"
  | "cinema"
  | "soft"
  | "noir"
  | "fade_film";

export type LookSpec = {
  preset: LookPresetId;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  vignette: number;
  sharpen: number;
};

export type EditSpec = {
  version: 1;
  source: {
    startMs: number;
    endMs: number;
    cropNorm: Box;
    backgroundFill?: "blur" | "solid" | "none";
    backgroundColor?: string;
    /** Global playback rate 0.25–4; default 1 */
    playbackRate?: number;
    speedSegments?: SpeedSegment[];
    flipX?: boolean;
    flipY?: boolean;
    /** Editor-intent rotation in 90° turns (separate from probe upright). */
    rotateQuarterTurns?: 0 | 1 | 2 | 3;
    fadeInMs?: number;
    fadeOutMs?: number;
    sourceMuted?: boolean;
  };
  reaction?: {
    kind: "video" | "image" | "none";
    offsetMs: number;
    audio: { sourceGain: number; reactionGain: number; ducking: boolean };
  };
  layout: LayoutSpec;
  captions?: {
    enabled: boolean;
    styleId: "bold-white-outline" | "bold-yellow-black" | "word-by-word-pop";
    words: TimedWord[];
  };
  look?: LookSpec;
  textOverlays?: TextOverlay[];
  backgroundMusic?: {
    trackId: string;
    gainDb: number;
    fadeInMs: number;
    fadeOutMs: number;
    offset: "start" | number;
  };
  jumpCuts?: {
    enabled: boolean;
    removeSilencesAboveMs: number;
    transitionMs: number;
    /** Desired output length after silence removal (locked short length). */
    targetLengthMs?: number;
    /** Absolute source silence ranges from audio detect / refill apply. */
    silenceRanges?: { startMs: number; endMs: number }[];
    /** Speech islands to concat after apply (absolute source ms). */
    keepRanges?: { startMs: number; endMs: number }[];
  };
  transitions?: TransitionSpec[];
  output: {
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
  };
};

export type ClipCandidate = {
  id: string;
  startMs: number;
  endMs: number;
  score: number;
  reason: string;
  /** Transcript excerpt for suggestion cards */
  quote?: string;
  /** Punchy short title (template or local LLM) */
  title?: string;
  cropNorm: Box;
  scores: {
    hook: number;
    clarity: number;
    context: number;
    face: number;
    ending: number;
  };
};

/** Caption style IDs supported in burn-in + preview. */
export type CaptionStyleId =
  | "bold-white-outline"
  | "bold-yellow-black"
  | "word-by-word-pop";

export type LayoutSuggestion = {
  layout: LayoutSpec;
  score: number;
  reason: string;
};

export type AnalysisResult = {
  version: 1;
  status: "complete" | "partial" | "failed";
  probe: ProbeResult;
  scenes: { tMs: number; score: number }[];
  faces: { tMs: number; boxesNorm: Box[]; primary?: Box }[];
  transcript?: {
    language?: string;
    segments: { startMs: number; endMs: number; text: string }[];
    words?: TimedWord[];
  };
  silenceRanges?: { startMs: number; endMs: number }[];
  candidates: ClipCandidate[];
  layoutSuggestions: LayoutSuggestion[];
  degradations: string[];
};

export type EditorHistory = {
  past: EditSpec[];
  present: EditSpec;
  future: EditSpec[];
};

export type AnalysisPhase =
  | "probe"
  | "extract_audio"
  | "whisper"
  | "frames"
  | "scenes"
  | "faces"
  | "score"
  | "persist";

export type EncodePhase =
  | "load_wasm"
  | "write_inputs"
  | "filter"
  | "encode"
  | "mux"
  | "validate"
  | "upload";

export type ProgressEvent = {
  phase: string;
  percent: number;
  message?: string;
};
