import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { MAX_SOURCE_BYTES } from "@/lib/constants";
import { getDb, isDbConfigured, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!isDbConfigured() || !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({
      mode: "local",
      message: "Blob not configured — keep file in IndexedDB only",
    });
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

  const body = (await req.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/mp4",
          "video/quicktime",
          "video/x-m4v",
        ],
        maximumSizeInBytes: MAX_SOURCE_BYTES,
        tokenPayload: JSON.stringify({
          projectId: id,
          userId: session.user!.id,
        }),
      }),
      onUploadCompleted: async ({ blob }) => {
        await db
          .update(schema.projects)
          .set({
            sourceBlobUrl: blob.url,
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, id));
        void blob;
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload token failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
