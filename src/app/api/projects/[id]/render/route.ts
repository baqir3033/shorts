import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { getDb, isDbConfigured, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Register a client-encoded render (JSON metadata) or accept multipart upload. */
export async function PUT(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

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

  const contentType = req.headers.get("content-type") ?? "";
  let variant = "main";
  let outputBlobUrl: string | null = null;
  let status = "succeeded";
  let error: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    variant = String(form.get("variantName") ?? "main");
    const file = form.get("file");
    if (file instanceof File && process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`renders/${id}/${variant}-${Date.now()}.mp4`, file, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      outputBlobUrl = blob.url;
    }
  } else {
    const body = await req.json();
    variant = typeof body.variantName === "string" ? body.variantName : "main";
    outputBlobUrl =
      typeof body.outputBlobUrl === "string" ? body.outputBlobUrl : null;
    status = typeof body.status === "string" ? body.status : "succeeded";
    error = typeof body.error === "string" ? body.error : null;
  }

  const existing = await db
    .select()
    .from(schema.renders)
    .where(
      and(
        eq(schema.renders.projectId, id),
        eq(schema.renders.variantName, variant),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.renders)
      .set({ status, outputBlobUrl, error })
      .where(eq(schema.renders.id, existing[0].id));
  } else {
    await db.insert(schema.renders).values({
      projectId: id,
      variantName: variant,
      status,
      outputBlobUrl,
      error,
    });
  }

  return NextResponse.json({ ok: true, variant, outputBlobUrl });
}
