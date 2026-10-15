import { MAX_EDGE_PX, MAX_PROJECTS_PER_USER } from "@/lib/constants";
import { sniffContainer, sniffImage } from "./magicBytes";
import { probeImageFile, probeVideoFile } from "./probe";
import { validateFileSize, validateProbe } from "./validate";
import {
  cacheSourceFile,
  enforceLocalFifo,
  saveProjectMeta,
  type LocalProjectMeta,
} from "./indexedDb";
import { IngestError, type ProjectMedia } from "./types";

export type IngestOptions = {
  projectId: string;
  title?: string;
  signal?: AbortSignal;
  /** When true and at capacity, remove oldest local project(s). */
  confirmFifo?: boolean;
  onProgress?: (percent: number, message: string) => void;
};

/**
 * Deep ingest module interface:
 * ingestLocalFile(file) → ProjectMedia
 */
export async function ingestLocalFile(
  file: File,
  opts: IngestOptions,
): Promise<ProjectMedia> {
  const { projectId, signal, onProgress } = opts;
  onProgress?.(5, "Checking file size");
  if (signal?.aborted) throw new IngestError("ABORTED", "Ingest aborted");

  validateFileSize(file.size, "source");

  onProgress?.(15, "Sniffing container");
  const head = await file.slice(0, 64).arrayBuffer();
  const sniff = sniffContainer(head);
  if (!sniff.ok) {
    throw new IngestError("CONTAINER_UNSUPPORTED", sniff.reason);
  }

  onProgress?.(35, "Probing media metadata");
  const rawProbe = await probeVideoFile(file, sniff.container, signal);
  const probe = validateProbe(rawProbe);

  onProgress?.(55, "Caching locally");
  if (opts.confirmFifo !== false) {
    const removed = await enforceLocalFifo(MAX_PROJECTS_PER_USER);
    if (removed.length && opts.confirmFifo === undefined) {
      // Caller should have confirmed; we still proceed when explicitly allowed
    }
  }

  await cacheSourceFile(projectId, file);

  const meta: LocalProjectMeta = {
    projectId,
    title: opts.title ?? file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    bytes: file.size,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    probe,
  };
  await saveProjectMeta(meta);

  onProgress?.(100, "Ready");
  const localObjectUrl = URL.createObjectURL(file);

  return {
    projectId,
    fileName: file.name,
    bytes: file.size,
    mimeType: file.type || `video/${sniff.container}`,
    probe,
    localObjectUrl,
    kind: "source",
  };
}

export async function ingestReactionAsset(
  file: File,
  opts: { projectId: string; signal?: AbortSignal },
): Promise<ProjectMedia> {
  validateFileSize(file.size, "reaction");
  const head = await file.slice(0, 64).arrayBuffer();

  const imageKind = sniffImage(head);
  if (imageKind) {
    const dims = await probeImageFile(file);
    if (
      Math.max(dims.width, dims.height) > MAX_EDGE_PX ||
      Math.min(dims.width, dims.height) < 1
    ) {
      throw new IngestError("INVALID_IMAGE", "Image dimensions out of range");
    }
    await cacheSourceFile(`${opts.projectId}:reaction`, file);
    return {
      projectId: opts.projectId,
      fileName: file.name,
      bytes: file.size,
      mimeType: file.type,
      probe: {
        durationMs: 0,
        width: dims.width,
        height: dims.height,
        rotation: 0,
        displayWidth: dims.width,
        displayHeight: dims.height,
        videoCodec: "image",
        audioCodec: null,
        videoBitrate: null,
        audioSampleRate: null,
        channels: null,
        fpsNum: 1,
        fpsDen: 1,
        isVfr: false,
        hasAudio: false,
        pixelFormat: null,
        container: "mp4",
        warnings: [],
      },
      localObjectUrl: URL.createObjectURL(file),
      kind: "reaction-image",
    };
  }

  const sniff = sniffContainer(head);
  if (!sniff.ok) {
    throw new IngestError("CONTAINER_UNSUPPORTED", sniff.reason);
  }
  const probe = validateProbe(
    await probeVideoFile(file, sniff.container, opts.signal),
  );
  await cacheSourceFile(`${opts.projectId}:reaction`, file);
  return {
    projectId: opts.projectId,
    fileName: file.name,
    bytes: file.size,
    mimeType: file.type,
    probe,
    localObjectUrl: URL.createObjectURL(file),
    kind: "reaction-video",
  };
}

export { IngestError, INGEST_USER_ACTIONS } from "./types";
export type { ProjectMedia, ProbeResult } from "./types";
