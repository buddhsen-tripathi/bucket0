/**
 * Agent Files List (Dashboard / Clerk auth)
 *
 * GET /api/agent-bucket/files/list?page=1&pageSize=50
 *
 * Lists agent files for the dashboard UI. Uses Clerk auth (not Bearer token).
 * Queries cloudFiles WHERE isAgentUpload = true.
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { agentLog } from "@/lib/shared/logger";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "50", 10), 1), 100);
    const offset = (page - 1) * pageSize;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.isAgentUpload, true)
        )
      );

    const total = Number(countResult.count);

    const files = await db
      .select({
        id: cloudFiles.id,
        fileKey: cloudFiles.fileKey,
        fileName: cloudFiles.fileName,
        fileSize: cloudFiles.fileSize,
        mimeType: cloudFiles.mimeType,
        isStarred: cloudFiles.isStarred,
        uploadedVia: cloudFiles.uploadedVia,
        hasThumbnail: cloudFiles.thumbnailKey,
        createdAt: cloudFiles.createdAt,
        updatedAt: cloudFiles.updatedAt,
      })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.isAgentUpload, true)
        )
      )
      .orderBy(desc(cloudFiles.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      files: files.map((f) => ({
        key: f.fileKey.replace(`users/${userId}/`, ""),
        fileName: f.fileName,
        size: f.fileSize,
        mimeType: f.mimeType,
        isStarred: f.isStarred,
        uploadedVia: f.uploadedVia,
        hasThumbnail: !!f.hasThumbnail,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      pagination: {
        total,
        page,
        pageSize,
        hasMore: offset + pageSize < total,
      },
    });
  } catch (error) {
    agentLog.error({ err: error }, "Agent files list error");
    return NextResponse.json({ error: "Failed to list agent files" }, { status: 500 });
  }
}
