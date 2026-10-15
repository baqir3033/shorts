import type { IngestErrorCode } from "@/lib/constants";

export type ProbeResult = {
  durationMs: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  displayWidth: number;
  displayHeight: number;
  videoCodec: string;
  audioCodec: string | null;
  videoBitrate: number | null;
  audioSampleRate: number | null;
  channels: number | null;
  fpsNum: number;
  fpsDen: number;
  isVfr: boolean;
  hasAudio: boolean;
  pixelFormat: string | null;
  container: "mp4" | "mov" | "m4v";
  warnings: string[];
};

export type ProjectMedia = {
  projectId: string;
  fileName: string;
  bytes: number;
  mimeType: string;
  probe: ProbeResult;
  localObjectUrl?: string;
  blobUrl?: string;
  kind: "source" | "reaction-video" | "reaction-image";
};

export class IngestError extends Error {
  code: IngestErrorCode;
  constructor(code: IngestErrorCode, message: string) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}

export const INGEST_USER_ACTIONS: Record<IngestErrorCode, string> = {
  FILE_TOO_LARGE: "Compress or shorten the video, then try again.",
  DURATION_OUT_OF_RANGE: "Use a clip between 1 second and 15 minutes.",
  CONTAINER_UNSUPPORTED: "Re-export as MP4 (H.264) or MOV.",
  CODEC_UNSUPPORTED: "Re-encode with a standard H.264/AAC profile.",
  PROBE_FAILED: "File looks corrupt or truncated — re-export and retry.",
  BLOB_QUOTA: "Cloud storage is full. Delete a project or wait for the quota to reset.",
  FIFO_BLOCKED: "Free a project slot or confirm replacing the oldest project.",
  ABORTED: "Upload cancelled.",
  INVALID_IMAGE: "Use JPEG, PNG, or WebP under 4096px.",
};
