import { get, set, del, keys } from "idb-keyval";
import type { AnalysisResult, EditSpec } from "@/media/edit-spec/types";
import type { ProbeResult } from "./types";

const FILE_PREFIX = "file:";
const SPEC_PREFIX = "editspec:";
const ANALYSIS_PREFIX = "analysis:";
const PROBE_PREFIX = "probe:";
const META_PREFIX = "projectmeta:";

export type LocalProjectMeta = {
  projectId: string;
  title: string;
  fileName: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
  probe: ProbeResult;
  blobUrl?: string;
  renderBlobUrl?: string;
};

export async function cacheSourceFile(
  projectId: string,
  file: File,
): Promise<void> {
  await set(`${FILE_PREFIX}${projectId}`, file);
}

export async function getCachedSourceFile(
  projectId: string,
): Promise<File | undefined> {
  return get<File>(`${FILE_PREFIX}${projectId}`);
}

export async function deleteCachedSourceFile(projectId: string): Promise<void> {
  await del(`${FILE_PREFIX}${projectId}`);
}

export async function saveEditSpecLocal(
  projectId: string,
  variant: string,
  spec: EditSpec,
): Promise<void> {
  await set(`${SPEC_PREFIX}${projectId}:${variant}`, {
    spec,
    savedAt: Date.now(),
  });
}

export async function getEditSpecLocal(
  projectId: string,
  variant = "main",
): Promise<{ spec: EditSpec; savedAt: number } | undefined> {
  return get(`${SPEC_PREFIX}${projectId}:${variant}`);
}

export async function saveAnalysisLocal(
  projectId: string,
  analysis: AnalysisResult,
): Promise<void> {
  await set(`${ANALYSIS_PREFIX}${projectId}`, {
    analysis,
    savedAt: Date.now(),
  });
}

export async function getAnalysisLocal(
  projectId: string,
): Promise<{ analysis: AnalysisResult; savedAt: number } | undefined> {
  return get(`${ANALYSIS_PREFIX}${projectId}`);
}

export async function saveProjectMeta(meta: LocalProjectMeta): Promise<void> {
  await set(`${META_PREFIX}${meta.projectId}`, meta);
}

export async function getProjectMeta(
  projectId: string,
): Promise<LocalProjectMeta | undefined> {
  return get(`${META_PREFIX}${projectId}`);
}

export async function listLocalProjectMetas(): Promise<LocalProjectMeta[]> {
  const allKeys = await keys();
  const metas: LocalProjectMeta[] = [];
  for (const k of allKeys) {
    if (typeof k === "string" && k.startsWith(META_PREFIX)) {
      const m = await get<LocalProjectMeta>(k);
      if (m) metas.push(m);
    }
  }
  return metas.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function deleteLocalProject(projectId: string): Promise<void> {
  await deleteCachedSourceFile(projectId);
  await del(`${PROBE_PREFIX}${projectId}`);
  await del(`${ANALYSIS_PREFIX}${projectId}`);
  await del(`${META_PREFIX}${projectId}`);
  const allKeys = await keys();
  for (const k of allKeys) {
    if (
      typeof k === "string" &&
      (k.startsWith(`${SPEC_PREFIX}${projectId}:`) ||
        k === `${SPEC_PREFIX}${projectId}`)
    ) {
      await del(k);
    }
  }
}

/** Enforce local FIFO of 7 by createdAt ascending (oldest first). */
export async function enforceLocalFifo(
  maxProjects: number,
): Promise<LocalProjectMeta[]> {
  const metas = await listLocalProjectMetas();
  if (metas.length < maxProjects) return [];
  const sorted = [...metas].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const toRemove = sorted.slice(0, metas.length - maxProjects + 1);
  for (const m of toRemove) {
    await deleteLocalProject(m.projectId);
  }
  return toRemove;
}
