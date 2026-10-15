import { asc, eq, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { MAX_PROJECTS_PER_USER } from "@/lib/constants";
import { getDb, schema } from "@/lib/db";

export type FifoPurgeResult = {
  deletedProjectIds: string[];
  deletedBlobUrls: string[];
};

/**
 * Transactional-ish FIFO: if user has ≥7 projects, delete oldest + blobs.
 * Neon HTTP driver has no real multi-statement transaction; order operations carefully.
 */
export async function enforceCloudFifo(
  userId: string,
): Promise<FifoPurgeResult> {
  const db = getDb();
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  const count = countRows[0]?.count ?? 0;
  if (count < MAX_PROJECTS_PER_USER) {
    return { deletedProjectIds: [], deletedBlobUrls: [] };
  }

  const toRemoveCount = count - MAX_PROJECTS_PER_USER + 1;
  const oldest = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(asc(schema.projects.createdAt))
    .limit(toRemoveCount);

  const deletedProjectIds: string[] = [];
  const deletedBlobUrls: string[] = [];

  for (const project of oldest) {
    const urls: string[] = [];
    if (project.sourceBlobUrl) urls.push(project.sourceBlobUrl);

    const renderRows = await db
      .select()
      .from(schema.renders)
      .where(eq(schema.renders.projectId, project.id));
    for (const r of renderRows) {
      if (r.outputBlobUrl) urls.push(r.outputBlobUrl);
    }

    const reactionRows = await db
      .select()
      .from(schema.reactionAssets)
      .where(eq(schema.reactionAssets.projectId, project.id));
    for (const r of reactionRows) {
      if (r.blobUrl) urls.push(r.blobUrl);
    }

    for (const url of urls) {
      try {
        await del(url);
        deletedBlobUrls.push(url);
      } catch {
        /* blob may already be gone */
      }
    }

    await db
      .delete(schema.projects)
      .where(eq(schema.projects.id, project.id));
    deletedProjectIds.push(project.id);
  }

  return { deletedProjectIds, deletedBlobUrls };
}

export async function listOldestProjectTitle(
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(asc(schema.projects.createdAt))
    .limit(1);
  return rows[0]?.title ?? null;
}
