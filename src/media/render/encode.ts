import type { EditSpec, ProgressEvent } from "@/media/edit-spec/types";
import { parseEditSpec } from "@/media/edit-spec/schema";
import { uprightSize } from "./layoutMath";
import { buildFilterGraph } from "./buildFilterGraph";
import {
  CAPTION_FONT_MEMFS,
  CAPTION_FONT_PUBLIC,
} from "./captionBurn";
import type { ProbeResult } from "@/media/ingest/types";
import {
  getFFmpeg,
  isFFmpegBusy,
  terminateFFmpeg as terminateShared,
  withFFmpegLock,
} from "./ffmpegClient";

export type EncodeInputs = {
  source: File | Blob;
  reaction?: File | Blob | null;
  reactionKind?: "video" | "image" | "none";
  probe: ProbeResult;
  hasSourceAudio?: boolean;
  hasReactionAudio?: boolean;
  silenceRanges?: { startMs: number; endMs: number }[];
  transcriptItems?: { startMs: number; endMs: number }[];
};

export type EncodeResult = {
  blob: Blob;
  fileName: string;
  durationMs: number;
};

export async function encodeEditSpec(
  rawSpec: unknown,
  inputs: EncodeInputs,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (ev: ProgressEvent) => void;
    watchdogMs?: number;
  },
): Promise<EncodeResult> {
  if (isFFmpegBusy()) {
    throw new EncodeError("ENCODE_BUSY", "Another encode is already running");
  }
  const watchdogMs = opts?.watchdogMs ?? 12 * 60 * 1000;

  try {
    return await withFFmpegLock(async () => {
      const spec = parseEditSpec(rawSpec) as EditSpec;
      if (opts?.signal?.aborted) {
        throw new EncodeError("ABORTED", "Encode aborted");
      }

      const { fetchFile } = await import("@ffmpeg/util");
      const ffmpeg = await getFFmpeg(opts?.onProgress);
      opts?.onProgress?.({
        phase: "write_inputs",
        percent: 12,
        message: "Writing inputs",
      });

      const srcName = "source.mp4";
      await ffmpeg.writeFile(srcName, await fetchFile(inputs.source));

      const needsFont =
        (spec.captions?.enabled && (spec.captions.words?.length ?? 0) > 0) ||
        (spec.textOverlays?.length ?? 0) > 0;
      // drawtext requires an explicit font inside ffmpeg.wasm MEMFS
      if (needsFont) {
        opts?.onProgress?.({
          phase: "write_inputs",
          percent: 14,
          message: "Loading caption font",
        });
        const fontUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${CAPTION_FONT_PUBLIC}`
            : CAPTION_FONT_PUBLIC;
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) {
          throw new EncodeError(
            "ENCODE_FAILED",
            `Caption font missing (${fontRes.status}). Expected ${CAPTION_FONT_PUBLIC}`,
          );
        }
        await ffmpeg.writeFile(
          CAPTION_FONT_MEMFS,
          await fetchFile(await fontRes.blob()),
        );
      }

      const hasReaction =
        !!inputs.reaction &&
        inputs.reactionKind !== "none" &&
        spec.reaction?.kind !== "none";

      let reactionName: string | null = null;
      if (hasReaction && inputs.reaction) {
        const isImage =
          inputs.reactionKind === "image" ||
          (typeof File !== "undefined" &&
            inputs.reaction instanceof File &&
            inputs.reaction.type.startsWith("image/"));
        const ext = isImage
          ? inputs.reaction instanceof File &&
            /\.jpe?g$/i.test(inputs.reaction.name)
            ? "jpg"
            : "png"
          : "mp4";
        reactionName = `reaction.${ext}`;
        await ffmpeg.writeFile(reactionName, await fetchFile(inputs.reaction));
      }

      const upright = uprightSize(inputs.probe);
      let graph = buildFilterGraph(spec, {
        hasReactionVideo: hasReaction && inputs.reactionKind === "video",
        hasReactionImage: hasReaction && inputs.reactionKind === "image",
        hasSourceAudio: inputs.hasSourceAudio !== false && inputs.probe.hasAudio,
        hasReactionAudio: !!inputs.hasReactionAudio,
        upright,
        sourceRotation: inputs.probe.rotation,
        silenceRanges: inputs.silenceRanges,
        transcriptItems: inputs.transcriptItems,
      });

      // If wasm build lacks afftdn, strip it once and rebuild-compatible
      let filterComplex = graph.filterComplex;
      const outName = "out.mp4";
      const passlog = "ffmpeg2pass";

      const runWithTimeout = async (args: string[]) => {
        const runPromise = ffmpeg.exec(args);
        const timeoutPromise = new Promise<never>((_, reject) => {
          const t = setTimeout(
            () =>
              reject(new EncodeError("ENCODE_TIMEOUT", "Encode watchdog fired")),
            watchdogMs,
          );
          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new EncodeError("ABORTED", "Encode aborted"));
          });
        });
        return Promise.race([runPromise, timeoutPromise]);
      };

      const baseInput = [
        "-i",
        srcName,
        ...(reactionName ? ["-i", reactionName] : []),
        "-filter_complex",
        filterComplex,
      ];

      // --- Pass 1 (analysis) ---
      opts?.onProgress?.({
        phase: "encode",
        percent: 28,
        message: "Pass 1/2 — analyzing",
      });

      const pass1Args = [
        ...baseInput,
        "-map",
        `[${graph.videoLabel}]`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-b:v",
        spec.output.videoBitrate || "8M",
        "-pass",
        "1",
        "-passlogfile",
        passlog,
        "-f",
        "null",
        "-",
      ];

      let exit1 = await runWithTimeout(pass1Args);
      if (typeof exit1 === "number" && exit1 !== 0) {
        // Retry without afftdn if filter missing
        if (filterComplex.includes("afftdn")) {
          filterComplex = filterComplex.replace(
            /,?afftdn=[^,\[\]]+/g,
            "",
          );
          baseInput[baseInput.indexOf("-filter_complex") + 1] = filterComplex;
          graph = { ...graph, filterComplex };
          opts?.onProgress?.({
            phase: "encode",
            percent: 30,
            message: "Pass 1/2 — retry without afftdn",
          });
          exit1 = await runWithTimeout([
            ...baseInput,
            "-map",
            `[${graph.videoLabel}]`,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-b:v",
            spec.output.videoBitrate || "8M",
            "-pass",
            "1",
            "-passlogfile",
            passlog,
            "-f",
            "null",
            "-",
          ]);
        }
        // Retry without xfade (hard-cut concat) if wasm lacks xfade
        if (
          typeof exit1 === "number" &&
          exit1 !== 0 &&
          filterComplex.includes("xfade")
        ) {
          const degraded = {
            ...spec,
            jumpCuts: spec.jumpCuts
              ? { ...spec.jumpCuts, transitionMs: 0 }
              : undefined,
            transitions: undefined,
          };
          graph = buildFilterGraph(degraded, {
            hasReactionVideo: hasReaction && inputs.reactionKind === "video",
            hasReactionImage: hasReaction && inputs.reactionKind === "image",
            hasSourceAudio:
              inputs.hasSourceAudio !== false && inputs.probe.hasAudio,
            hasReactionAudio: !!inputs.hasReactionAudio,
            upright,
            sourceRotation: inputs.probe.rotation,
            silenceRanges: inputs.silenceRanges,
            transcriptItems: inputs.transcriptItems,
          });
          filterComplex = graph.filterComplex;
          baseInput[baseInput.indexOf("-filter_complex") + 1] = filterComplex;
          opts?.onProgress?.({
            phase: "encode",
            percent: 31,
            message: "Pass 1/2 — hard cuts (xfade unavailable)",
          });
          exit1 = await runWithTimeout([
            ...baseInput,
            "-map",
            `[${graph.videoLabel}]`,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-b:v",
            spec.output.videoBitrate || "8M",
            "-pass",
            "1",
            "-passlogfile",
            passlog,
            "-f",
            "null",
            "-",
          ]);
        }
      }

      // If two-pass still fails, fall back to single-pass CRF quality path
      const usedTwoPass = typeof exit1 === "number" && exit1 === 0;

      if (!usedTwoPass) {
        opts?.onProgress?.({
          phase: "encode",
          percent: 40,
          message: "Single-pass quality encode",
        });
        const singleArgs = [
          "-i",
          srcName,
          ...(reactionName ? ["-i", reactionName] : []),
          "-filter_complex",
          filterComplex,
          ...graph.outputArgs.filter((a) => a !== "-pass"),
          outName,
        ];
        // Prefer CRF for single-pass quality
        const mapped = injectCrf(singleArgs);
        const exitS = await runWithTimeout(mapped);
        if (typeof exitS === "number" && exitS !== 0) {
          const logs = ((ffmpeg as { __logs?: string[] }).__logs ?? [])
            .slice(-12)
            .join(" | ");
          throw new EncodeError(
            "ENCODE_FAILED",
            `FFmpeg exited ${exitS}${logs ? `: ${logs}` : ""}`,
          );
        }
      } else {
        // --- Pass 2 (final) ---
        opts?.onProgress?.({
          phase: "encode",
          percent: 55,
          message: "Pass 2/2 — encoding",
        });
        const pass2Args = [
          "-i",
          srcName,
          ...(reactionName ? ["-i", reactionName] : []),
          "-filter_complex",
          filterComplex,
          ...graph.outputArgs,
          "-pass",
          "2",
          "-passlogfile",
          passlog,
          outName,
        ];
        const exit2 = await runWithTimeout(pass2Args);
        if (typeof exit2 === "number" && exit2 !== 0) {
          const logs = ((ffmpeg as { __logs?: string[] }).__logs ?? [])
            .slice(-12)
            .join(" | ");
          throw new EncodeError(
            "ENCODE_FAILED",
            `Pass 2 failed (${exit2})${logs ? `: ${logs}` : ""}`,
          );
        }
      }

      opts?.onProgress?.({
        phase: "validate",
        percent: 96,
        message: "Validating output",
      });

      const data = await ffmpeg.readFile(outName);
      const bytes =
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data as Uint8Array);
      if (bytes.byteLength < 1000) {
        const logs = ((ffmpeg as { __logs?: string[] }).__logs ?? [])
          .slice(-12)
          .join(" | ");
        throw new EncodeError(
          "VALIDATE_FAILED",
          `Output too small${logs ? `: ${logs}` : ""}`,
        );
      }

      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });
      const expectedMs = spec.source.endMs - spec.source.startMs;

      try {
        await ffmpeg.deleteFile(srcName);
        if (reactionName) await ffmpeg.deleteFile(reactionName);
        await ffmpeg.deleteFile(outName);
      } catch {
        /* ignore */
      }

      opts?.onProgress?.({
        phase: "mux",
        percent: 100,
        message: usedTwoPass ? "Done (2-pass)" : "Done",
      });

      return {
        blob,
        fileName: `short-${Math.round(expectedMs / 1000)}s.mp4`,
        durationMs: expectedMs,
      };
    });
  } catch (err) {
    if (err instanceof EncodeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("busy")) {
      throw new EncodeError("ENCODE_BUSY", msg);
    }
    if (msg.toLowerCase().includes("memory")) {
      throw new EncodeError("ENCODE_OOM", msg);
    }
    throw new EncodeError("ENCODE_FAILED", msg);
  }
}

/** Swap fixed bitrate for CRF when doing single-pass fallback. */
function injectCrf(args: string[]): string[] {
  const out = [...args];
  const bi = out.indexOf("-b:v");
  if (bi >= 0) {
    out.splice(bi, 2, "-crf", "18");
  }
  return out;
}

export async function terminateFFmpeg(): Promise<void> {
  await terminateShared();
}

export class EncodeError extends Error {
  code:
    | "ENCODE_BUSY"
    | "ENCODE_OOM"
    | "ENCODE_TIMEOUT"
    | "VALIDATE_FAILED"
    | "ENCODE_FAILED"
    | "ABORTED";
  constructor(code: EncodeError["code"], message: string) {
    super(message);
    this.name = "EncodeError";
    this.code = code;
  }
}
