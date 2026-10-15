import {
  MAX_DURATION_MS,
  MAX_EDGE_PX,
  MAX_REACTION_BYTES,
  MAX_SOURCE_BYTES,
  MIN_DURATION_MS,
  MIN_EDGE_PX,
} from "@/lib/constants";
import type { ProbeResult } from "./types";
import { IngestError } from "./types";

export function validateFileSize(
  bytes: number,
  kind: "source" | "reaction" = "source",
): void {
  if (bytes <= 0) {
    throw new IngestError("PROBE_FAILED", "File is empty");
  }
  const cap = kind === "source" ? MAX_SOURCE_BYTES : MAX_REACTION_BYTES;
  if (bytes > cap) {
    throw new IngestError(
      "FILE_TOO_LARGE",
      `File is ${(bytes / (1024 * 1024)).toFixed(1)} MB; max is ${(cap / (1024 * 1024)).toFixed(0)} MB`,
    );
  }
}

export function validateProbe(probe: ProbeResult): ProbeResult {
  if (
    probe.durationMs < MIN_DURATION_MS ||
    probe.durationMs > MAX_DURATION_MS
  ) {
    throw new IngestError(
      "DURATION_OUT_OF_RANGE",
      `Duration ${(probe.durationMs / 1000).toFixed(1)}s is outside 1s–15min`,
    );
  }

  const minEdge = Math.min(probe.displayWidth, probe.displayHeight);
  const maxEdge = Math.max(probe.displayWidth, probe.displayHeight);
  if (minEdge < MIN_EDGE_PX) {
    throw new IngestError(
      "CODEC_UNSUPPORTED",
      `Resolution too small (${probe.displayWidth}×${probe.displayHeight}); min edge ${MIN_EDGE_PX}px`,
    );
  }
  if (maxEdge > MAX_EDGE_PX) {
    throw new IngestError(
      "CODEC_UNSUPPORTED",
      `Resolution too large (${probe.displayWidth}×${probe.displayHeight}); max edge ${MAX_EDGE_PX}px`,
    );
  }

  const warnings = [...probe.warnings];
  const codec = probe.videoCodec.toLowerCase();
  if (codec.includes("hevc") || codec.includes("h265") || codec.includes("hvc1")) {
    warnings.push("hevc_slow_path");
  }
  if (codec.includes("hdr") || (probe.pixelFormat ?? "").includes("10le")) {
    warnings.push("hdr_unsupported_may_wash");
  }

  return { ...probe, warnings };
}

export function uprightSize(probe: Pick<ProbeResult, "width" | "height" | "rotation">): {
  w: number;
  h: number;
} {
  if (probe.rotation === 90 || probe.rotation === 270) {
    return { w: probe.height, h: probe.width };
  }
  return { w: probe.width, h: probe.height };
}
