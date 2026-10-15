/** Hard product caps — Hobby-safe defaults from the Expert Media Plan. */

export const MAX_SOURCE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_REACTION_BYTES = 100 * 1024 * 1024; // 100 MB
export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 15 * 60 * 1_000; // 15 min
export const MIN_EDGE_PX = 480;
export const MAX_EDGE_PX = 4096;

export const MAX_PROJECTS_PER_USER = 7;
export const MAX_VARIANTS_PER_PROJECT = 3;
export const MAX_TEMPLATES_PER_USER = 5;

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const OUTPUT_FPS = 30;
/** Default target bitrate for 1080×1920@30 shorts */
export const OUTPUT_VIDEO_BITRATE = "8M";

export const ALLOWED_CONTAINERS = ["mp4", "mov", "m4v"] as const;
export const PIP_SIZE_MIN = 8;
export const PIP_SIZE_MAX = 35;
export const PIP_SIZE_DEFAULT = 18;

export const FRAME_SAMPLE_INTERVAL_MS = 500; // ~2 fps
export const MAX_SAMPLE_FRAMES = 1800;
export const SCENE_MERGE_GAP_MS = 300;
export const CLIP_LENGTHS_MS = [30_000, 40_000, 60_000] as const;
export const TOP_K_CANDIDATES = 8;

export const EDIT_HISTORY_MAX = 30;
export const EDITOR_COOP_PATH = "/editor";

export const INGEST_ERROR_CODES = [
  "FILE_TOO_LARGE",
  "DURATION_OUT_OF_RANGE",
  "CONTAINER_UNSUPPORTED",
  "CODEC_UNSUPPORTED",
  "PROBE_FAILED",
  "BLOB_QUOTA",
  "FIFO_BLOCKED",
  "ABORTED",
  "INVALID_IMAGE",
] as const;

export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];
