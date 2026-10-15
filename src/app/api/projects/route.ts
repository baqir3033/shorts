import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { MAX_PROJECTS_PER_USER, MAX_SOURCE_BYTES } from "@/lib/constants";
import { getDb, isDbConfigured, schema } from "@/lib/db";
import { enforceCloudFifo, listOldestProjectTitle } from "@/lib/fifo";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({
      mode: "local",
      projects: [],
      message: "DATABASE_URL not set — using IndexedDB local mode",
    });
  }

  const db = getDb();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, session.user.id))
    .orderBy(desc(schema.projects.createdAt))
    .limit(MAX_PROJECTS_PER_USER);

  return NextResponse.json({ mode: "cloud", projects });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled project";
  const confirmFifo = Boolean(body.confirmFifo);
  const sourceBytes =
    typeof body.sourceBytes === "number" ? body.sourceBytes : undefined;
  const durationMs =
    typeof body.durationMs === "number" ? body.durationMs : undefined;
  const probeJson = body.probeJson ?? null;

  if (sourceBytes != null && sourceBytes > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: { code: "FILE_TOO_LARGE", message: "Source exceeds size cap" } },
      { status: 400 },
    );
  }

  if (!isDbConfigured()) {
    return NextResponse.json({
      mode: "local",
      project: {
        id: body.projectId ?? crypto.randomUUID(),
        title,
        status: "ready",
      },
    });
  }

  const db = getDb();
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.projects)
    .where(eq(schema.projects.userId, session.user.id));
  const count = countRows[0]?.count ?? 0;

  if (count >= MAX_PROJECTS_PER_USER && !confirmFifo) {
    const oldestTitle = await listOldestProjectTitle(session.user.id);
    return NextResponse.json(
      {
        error: {
          code: "FIFO_BLOCKED",
          message: `Saving this will remove your oldest project: ${oldestTitle ?? "untitled"}`,
          oldestTitle,
        },
      },
      { status: 409 },
    );
  }

  if (count >= MAX_PROJECTS_PER_USER && confirmFifo) {
    await enforceCloudFifo(session.user.id);
  }

  const inserted = await db
    .insert(schema.projects)
    .values({
      userId: session.user.id,
      title,
      status: "ready",
      sourceBytes: sourceBytes ?? null,
      durationMs: durationMs ?? null,
      probeJson,
    })
    .returning();

  return NextResponse.json({ mode: "cloud", project: inserted[0] });
}
