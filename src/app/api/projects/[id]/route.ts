import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { getDb, isDbConfigured, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ mode: "local", project: { id } });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project: rows[0] });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const urls: string[] = [];
  if (rows[0].sourceBlobUrl) urls.push(rows[0].sourceBlobUrl);

  const renders = await db
    .select()
    .from(schema.renders)
    .where(eq(schema.renders.projectId, id));
  for (const r of renders) {
    if (r.outputBlobUrl) urls.push(r.outputBlobUrl);
  }

  for (const url of urls) {
    try {
      await del(url);
    } catch {
      /* ignore */
    }
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
}
