import { NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";

/**
 * Toggle starred status for a file
 * POST /api/cloud/star
 * Body: { key: string, starred: boolean }
 * Note: key should be the file key without the users/{userId}/ prefix
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { key, starred } = body;

    if (!key || typeof starred !== "boolean") {
      return NextResponse.json(
        { error: "key and starred boolean are required" },
        { status: 400 }
      );
    }

    // Construct the full file key (same pattern as download API)
    const fileKey = `users/${userId}/${key}`;

    // Verify the file belongs to this user and update starred status.
    // Starring is metadata, not a content change — intentionally do NOT touch
    // updatedAt, so it doesn't alter the file's "modified" date or reorder Recent.
    const result = await db
      .update(cloudFiles)
      .set({
        isStarred: starred,
      })
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fileKey)
        )
      )
      .returning({ id: cloudFiles.id, isStarred: cloudFiles.isStarred });

    if (result.length === 0) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    cloudLog.info({ starred }, "Star toggled");
    return NextResponse.json({
      success: true,
      key,
      isStarred: result[0].isStarred,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Star toggle error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update starred status" },
      { status: 500 }
    );
  }
}
