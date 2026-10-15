import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, isDbConfigured, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const db = getDb();
  const owned = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!owned[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.insert(schema.analyses).values({
    projectId: id,
    status: body.status ?? "complete",
    resultJson: body.analysis ?? body,
    error: body.error ?? null,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ mode: "local", analysis: null });
  }

  const db = getDb();
  const owned = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, id),
        eq(schema.projects.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!owned[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.projectId, id))
    .limit(1);

  return NextResponse.json({ analysis: rows[0] ?? null });
}
