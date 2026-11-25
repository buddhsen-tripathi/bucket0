/**
 * Move/Copy Agent File to Drive
 *
 * POST /api/agent-bucket/files/move-to-drive
 * Body: { fileKey: string, mode: "move" | "copy", folder?: string | null }
 *
 * Move (folder=null): instant boolean flip, zero R2 operations
 * Move (folder set): R2 CopyObject + delete old + DB update
 * Copy: R2 CopyObject + new DB row + quota increment
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFiles, users, memoryChunks, shareLinks } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { agentLog } from "@/lib/shared/logger";
import { systemStorage } from "@/lib/cloud/system-service";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { isValidDestinationFolder } from "@/lib/agent/agent-key-service";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileKey, mode = "move", folder = null } = await request.json();

    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    if (mode !== "move" && mode !== "copy") {
      return NextResponse.json({ error: "mode must be 'move' or 'copy'" }, { status: 400 });
    }

    if (folder && !isValidDestinationFolder(folder)) {
      return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
    }

    const fullKey = `users/${userId}/${fileKey}`;

    // Get the agent file record
    const [sourceFile] = await db
      .select()
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fullKey),
          eq(cloudFiles.isAgentUpload, true)
        )
      )
      .limit(1);

    if (!sourceFile) {
      return NextResponse.json({ error: "Agent file not found" }, { status: 404 });
    }

    // Determine target path
    const sourceFileName = fileKey.split("/").pop() || fileKey;
    let targetRelativeKey: string;

    if (folder) {
      const cleanFolder = folder.endsWith("/") ? folder : `${folder}/`;
      targetRelativeKey = `${cleanFolder}${sourceFileName}`;
    } else {
      targetRelativeKey = sourceFileName;
    }

    const targetFullKey = `users/${userId}/${targetRelativeKey}`;

    if (mode === "move") {
      // The file leaves agent storage, so drop its agent memory chunks.
      await db.delete(memoryChunks).where(eq(memoryChunks.fileId, sourceFile.id));

      if (!folder || targetFullKey === fullKey) {
        // Simple move to root (or same path) — just flip the boolean
        await db
          .update(cloudFiles)
          .set({
            isAgentUpload: false,
            uploadedVia: null,
            updatedAt: new Date(),
          })
          .where(eq(cloudFiles.id, sourceFile.id));

        // Ensure the file's folder exists in the drive view too (was agent-only before).
        await cloudCatalog
          .onFileWritten(userId, sourceFile.fileKey, { isAgentUpload: false })
          .catch((err) => agentLog.error({ err }, "catalog folder sync failed"));

        agentLog.info({ fileKey, mode: "move-instant" }, "Agent file moved to drive");
        return NextResponse.json({
          success: true,
          fileName: sourceFileName,
          fileKey: targetRelativeKey,
          mode: "move",
        });
      }

      // Move to a different folder — need R2 rename (copy + delete)
      // Check for filename conflict at target
      const resolvedKey = await resolveTargetKey(userId, targetFullKey);

      await systemStorage.copyObject(fullKey, resolvedKey);

      // Update DB record
      const resolvedRelativeKey = resolvedKey.replace(`users/${userId}/`, "");
      await db
        .update(cloudFiles)
        .set({
          fileKey: resolvedKey,
          fileName: resolvedRelativeKey,
          isAgentUpload: false,
          uploadedVia: null,
          folderPath: cloudCatalog.deriveFolderPath(userId, resolvedKey),
          updatedAt: new Date(),
        })
        .where(eq(cloudFiles.id, sourceFile.id));

      await systemStorage.deleteByKey(fullKey);

      // The file left its old key; deactivate share links bound to it
      await db
        .update(shareLinks)
        .set({ isActive: false })
        .where(and(eq(shareLinks.userId, userId), eq(shareLinks.fileKey, fileKey)));

      await cloudCatalog
        .onFileWritten(userId, resolvedKey, { isAgentUpload: false })
        .catch((err) => agentLog.error({ err }, "catalog folder sync failed"));

      agentLog.info({ fileKey, targetKey: resolvedKey, mode: "move-rename" }, "Agent file moved to drive folder");
      return NextResponse.json({
        success: true,
        fileName: resolvedRelativeKey.split("/").pop(),
        fileKey: resolvedRelativeKey,
        mode: "move",
      });
    }

    // Copy mode
    const resolvedKey = await resolveTargetKey(userId, targetFullKey);

    await systemStorage.copyObject(fullKey, resolvedKey);

    // Insert new cloudFiles row for the copy
    const resolvedRelativeKey = resolvedKey.replace(`users/${userId}/`, "");
    await db.insert(cloudFiles).values({
      userId,
      fileKey: resolvedKey,
      fileName: resolvedRelativeKey,
      fileSize: sourceFile.fileSize,
      mimeType: sourceFile.mimeType,
      encrypted: sourceFile.encrypted,
      encryptionMode: sourceFile.encryptionMode,
      iv: sourceFile.iv,
      authTag: sourceFile.authTag,
      thumbnailKey: null, // Thumbnail will be regenerated
      isAgentUpload: false,
      uploadedVia: null,
      folderPath: cloudCatalog.deriveFolderPath(userId, resolvedKey),
    });
    await cloudCatalog
      .onFileWritten(userId, resolvedKey, { isAgentUpload: false })
      .catch((err) => agentLog.error({ err }, "catalog folder sync failed"));

    // Increment quota for the copy
    await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${sourceFile.fileSize}`,
        fileCount: sql`${users.fileCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    agentLog.info({ fileKey, targetKey: resolvedKey, mode: "copy" }, "Agent file copied to drive");
    return NextResponse.json({
      success: true,
      fileName: resolvedRelativeKey.split("/").pop(),
      fileKey: resolvedRelativeKey,
      mode: "copy",
    });
  } catch (error) {
    agentLog.error({ err: error }, "Move to drive error");
    return NextResponse.json({ error: "Failed to move file" }, { status: 500 });
  }
}

/**
 * Resolve filename conflicts at target path.
 * If a file already exists, append timestamp to filename.
 */
async function resolveTargetKey(userId: string, targetFullKey: string): Promise<string> {
  const [existing] = await db
    .select({ id: cloudFiles.id })
    .from(cloudFiles)
    .where(
      and(
        eq(cloudFiles.userId, userId),
        eq(cloudFiles.fileKey, targetFullKey)
      )
    )
    .limit(1);

  if (!existing) {
    return targetFullKey;
  }

  // Append timestamp to avoid collision
  const lastSlash = targetFullKey.lastIndexOf("/");
  const dir = targetFullKey.slice(0, lastSlash + 1);
  const fileName = targetFullKey.slice(lastSlash + 1);
  const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
  const baseName = fileName.replace(ext, "");

  return `${dir}${baseName}_${Date.now()}${ext}`;
}
