import { getGeneratedThumbnail } from "@/lib/cloud/thumbnail-storage";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";


/**
 * GET /api/cloud/thumbnail
 * Serve thumbnail for a file
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fileKey = searchParams.get("key");

    if (!fileKey) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Get file metadata from database
    const fileRecord = await db
      .select()
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, `users/${userId}/${fileKey}`)
        )
      )
      .limit(1);

    if (fileRecord.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const file = fileRecord[0];

    // Check if thumbnail exists
    if (!file.thumbnailKey) {
      return NextResponse.json(
        { error: "Thumbnail not available" },
        { status: 404 }
      );
    }

    const thumbnail = await getGeneratedThumbnail(file.thumbnailKey);
    if (!thumbnail) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    return new NextResponse(thumbnail.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    cloudLog.error({ err: error }, "Thumbnail fetch error");
    return NextResponse.json(
      { error: "Failed to fetch thumbnail" },
      { status: 500 }
    );
  }
}
