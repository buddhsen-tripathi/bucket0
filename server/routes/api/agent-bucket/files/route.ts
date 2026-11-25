import { deleteGeneratedThumbnails } from "@/lib/cloud/thumbnail-storage";
/**
 * Agent File List & Delete
 *
 * GET    /api/agent-bucket/files?page=1&pageSize=50 - List agent files (Bearer auth)
 * DELETE /api/agent-bucket/files?key=xxx - Delete an agent file (Bearer auth)
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { cloudFiles, users, shareLinks } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { systemStorage } from "@/lib/cloud/system-service";
import { agentLog } from "@/lib/shared/logger";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";

/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

/**
 * GET - List agent files with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "50", 10), 1), 100);
    const offset = (page - 1) * pageSize;

    // Count total agent files
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

    // Fetch paginated files
    const files = await db
      .select({
        id: cloudFiles.id,
        fileKey: cloudFiles.fileKey,
        fileName: cloudFiles.fileName,
        fileSize: cloudFiles.fileSize,
        mimeType: cloudFiles.mimeType,
        isStarred: cloudFiles.isStarred,
        uploadedVia: cloudFiles.uploadedVia,
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
    agentLog.error({ err: error }, "Agent file list error");
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

/**
 * DELETE - Delete an agent file
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    const fullKey = `users/${userId}/${key}`;

    // Get file record (must be an agent upload)
    const [fileRecord] = await db
      .select({ id: cloudFiles.id, fileSize: cloudFiles.fileSize })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fullKey),
          eq(cloudFiles.isAgentUpload, true)
        )
      )
      .limit(1);

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete from R2
    await systemStorage.deleteFile(userId, key);

    // Delete from database
    await db.delete(cloudFiles).where(eq(cloudFiles.id, fileRecord.id));

    // Deactivate share links for this file so a later object at the same key is not served
    await db
      .update(shareLinks)
      .set({ isActive: false })
      .where(and(eq(shareLinks.userId, userId), eq(shareLinks.fileKey, key)));

    await deleteGeneratedThumbnails("personal", userId, [fileRecord.id]);

    // Decrement quota
    await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(${users.storageUsage} - ${fileRecord.fileSize}, 0)`,
        fileCount: sql`GREATEST(${users.fileCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    agentLog.info({ key }, "Agent file deleted");
    return NextResponse.json({ success: true });
  } catch (error) {
    agentLog.error({ err: error }, "Agent file delete error");
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
