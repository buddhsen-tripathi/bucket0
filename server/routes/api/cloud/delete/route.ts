import { deleteGeneratedThumbnails } from "@/lib/cloud/thumbnail-storage";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { dbService } from "@/lib/shared/db-service";
import { db } from "@/lib/shared/db";
import { cloudFiles, shareLinks } from "@/db/schema";
import { eq, and, like, notInArray } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    let size = 0;
    let count = 1;

    const fullKey = `users/${userId}/${key}`;

    // Check if it's a folder (ends with slash)
    if (key.endsWith("/")) {
      // Get original file sizes from DB before deletion (not R2 encrypted sizes)
      // This ensures quota is decremented by the original size, not encrypted size
      const folderFiles = await db
        .select({ id: cloudFiles.id, fileSize: cloudFiles.fileSize })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, userId),
            like(cloudFiles.fileKey, `${escapeLikePattern(fullKey)}%`),
            eq(cloudFiles.isAgentUpload, false)
          )
        );

      size = folderFiles.reduce((sum, f) => sum + f.fileSize, 0);
      count = folderFiles.length;

      // Agent Storage files can share this path; leave their objects in R2
      const agentFiles = await db
        .select({ fileKey: cloudFiles.fileKey })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, userId),
            like(cloudFiles.fileKey, `${escapeLikePattern(fullKey)}%`),
            eq(cloudFiles.isAgentUpload, true)
          )
        );

      // Delete from R2
      await systemStorage.deleteFolder(userId, key, new Set(agentFiles.map((file) => file.fileKey)));

      // Agent share links only target files; folder markers must not keep this folder's own link alive
      const agentFileKeys = agentFiles
        .map((file) => file.fileKey.slice(`users/${userId}/`.length))
        .filter((relativeKey) => !relativeKey.endsWith("/"));

      // Deactivate share links for deleted files (Issue 25 fix)
      await db
        .update(shareLinks)
        .set({ isActive: false })
        .where(
          and(
            eq(shareLinks.userId, userId),
            like(shareLinks.fileKey, `${escapeLikePattern(key)}%`),
            agentFileKeys.length > 0 ? notInArray(shareLinks.fileKey, agentFileKeys) : undefined
          )
        );

      // Delete all cloudFiles records for this folder (exclude agent files)
      await db.delete(cloudFiles).where(
        and(
          eq(cloudFiles.userId, userId),
          like(cloudFiles.fileKey, `${escapeLikePattern(fullKey)}%`),
          eq(cloudFiles.isAgentUpload, false)
        )
      );

      await deleteGeneratedThumbnails("personal", userId, folderFiles.map((file) => file.id));

      // Drop the folder (and any sub-folders) from the catalog.
      await cloudCatalog
        .removeFolderSubtree(userId, key, { isAgentUpload: false })
        .catch((err) => cloudLog.error({ err }, "catalog folder sync failed"));
    } else {
      // Get original file size from DB (not R2 encrypted size)
      // This ensures quota is decremented by the original size, not encrypted size
      const [fileRecord] = await db
        .select({ id: cloudFiles.id, fileSize: cloudFiles.fileSize, isAgentUpload: cloudFiles.isAgentUpload })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, userId),
            eq(cloudFiles.fileKey, fullKey),
            eq(cloudFiles.isAgentUpload, false)
          )
        )
        .limit(1);

      // A key that belongs to Agent Storage is not a My Drive file; leave it alone
      if (!fileRecord) {
        const [agentFile] = await db
          .select({ id: cloudFiles.id })
          .from(cloudFiles)
          .where(
            and(
              eq(cloudFiles.userId, userId),
              eq(cloudFiles.fileKey, fullKey),
              eq(cloudFiles.isAgentUpload, true)
            )
          )
          .limit(1);
        if (agentFile) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }
      }

      // Use DB size (original), fall back to R2 size when no catalog row exists
      size = fileRecord?.fileSize ?? await systemStorage.getFileSize(userId, key);

      // Delete from R2
      await systemStorage.deleteFile(userId, key);

      // Deactivate share links for this file (Issue 25 fix)
      await db
        .update(shareLinks)
        .set({ isActive: false })
        .where(
          and(
            eq(shareLinks.userId, userId),
            eq(shareLinks.fileKey, key)
          )
        );

      // Delete the cloudFiles record
      await db.delete(cloudFiles).where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fullKey),
          eq(cloudFiles.isAgentUpload, false)
        )
      );

      if (fileRecord) await deleteGeneratedThumbnails("personal", userId, [fileRecord.id]);
    }

    // Decrement usage using original file size (not encrypted size)
    if (size > 0) {
      await dbService.decrementUsage(userId, size, count);
    }

    cloudLog.info("File deleted");
    return NextResponse.json({ success: true });
  } catch (error) {
    cloudLog.error({ err: error }, "Cloud delete error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete file" },
      { status: 500 }
    );
  }
}
