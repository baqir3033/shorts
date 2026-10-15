import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, isDbConfigured, schema } from "@/lib/db";
import { parseEditSpec } from "@/media/edit-spec/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const variant =
    typeof body.variantName === "string" ? body.variantName : "main";

  let spec;
  try {
    spec = parseEditSpec(body.spec);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_EDIT_SPEC",
          message: err instanceof Error ? err.message : "Invalid EditSpec",
        },
      },
      { status: 400 },
    );
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, mode: "local", variant });
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

  const existing = await db
    .select()
    .from(schema.editSpecs)
    .where(
      and(
        eq(schema.editSpecs.projectId, id),
        eq(schema.editSpecs.variantName, variant),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.editSpecs)
      .set({ specJson: spec, updatedAt: new Date() })
      .where(eq(schema.editSpecs.id, existing[0].id));
  } else {
    await db.insert(schema.editSpecs).values({
      projectId: id,
      variantName: variant,
      version: 1,
      specJson: spec,
    });
  }

  return NextResponse.json({ ok: true, variant });
}

export async function GET(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const variant =
    new URL(req.url).searchParams.get("variant") ?? "main";

  if (!isDbConfigured()) {
    return NextResponse.json({ mode: "local", spec: null });
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
    .from(schema.editSpecs)
    .where(
      and(
        eq(schema.editSpecs.projectId, id),
        eq(schema.editSpecs.variantName, variant),
      ),
    )
    .limit(1);

  return NextResponse.json({ spec: rows[0]?.specJson ?? null, variant });
}
