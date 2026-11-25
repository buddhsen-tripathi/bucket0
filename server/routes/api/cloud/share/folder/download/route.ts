import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { and, asc, eq, sql } from "drizzle-orm";
import { cloudFiles, cloudFolders, shareLinks } from "@/db/schema";
import { db } from "@/lib/shared/db";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";
import { getClientIp } from "@/lib/shared/http-utils";
import { createFolderZipStream } from "@/lib/cloud/folder-zip-stream";


const MAX_ZIP_FILES = 500;
const MAX_ZIP_FOLDERS = 1000;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

function safeZipSegment(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\.+$/g, "").trim() || "shared-folder";
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimitResult = await RateLimiters.shareFolderZip(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many folder download requests. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("id");

    if (!linkId) {
      return NextResponse.json({ error: "Link ID required" }, { status: 400 });
    }

    const [shareLink] = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.id, linkId),
          eq(shareLinks.isActive, true),
          eq(shareLinks.targetType, "folder")
        )
      )
      .limit(1);

    if (!shareLink) {
      return NextResponse.json({ error: "Folder link not found or revoked" }, { status: 404 });
    }

    if (!shareLink.allowDownload) {
      return NextResponse.json({ error: "Folder download is disabled" }, { status: 403 });
    }

    if (shareLink.accessType === "protected") {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    const storagePrefix = `users/${shareLink.userId}/`;
    const folderStoragePrefix = `${storagePrefix}${shareLink.fileKey}`;
    const folderLikePrefix = `${escapeLikePattern(shareLink.fileKey)}%`;
    const fileLikePrefix = `${escapeLikePattern(folderStoragePrefix)}%`;
    const [folders, files] = await Promise.all([
      db
        .select({ path: cloudFolders.path })
        .from(cloudFolders)
        .where(
          and(
            eq(cloudFolders.userId, shareLink.userId),
            eq(cloudFolders.isAgentUpload, false),
            sql`${cloudFolders.path} LIKE ${folderLikePrefix} ESCAPE '\\'`
          )
        )
        .orderBy(asc(cloudFolders.path)),
      db
        .select({
          fileKey: cloudFiles.fileKey,
          fileSize: cloudFiles.fileSize,
          encrypted: cloudFiles.encrypted,
          encryptionMode: cloudFiles.encryptionMode,
        })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, shareLink.userId),
            eq(cloudFiles.isAgentUpload, false),
            sql`${cloudFiles.fileKey} LIKE ${fileLikePrefix} ESCAPE '\\'`,
            sql`${cloudFiles.fileKey} NOT LIKE '%/'`
          )
        )
        .orderBy(asc(cloudFiles.fileKey)),
    ]);

    const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
    if (files.length > MAX_ZIP_FILES || folders.length > MAX_ZIP_FOLDERS || totalBytes > MAX_ZIP_BYTES) {
      return NextResponse.json(
        {
          error: "Folder is too large to download as a ZIP",
          maxFiles: MAX_ZIP_FILES,
          maxFolders: MAX_ZIP_FOLDERS,
          maxBytes: MAX_ZIP_BYTES,
        },
        { status: 413 }
      );
    }

    const rootName = safeZipSegment(shareLink.fileName);
    const folderPaths = folders
      .map((folder) => folder.path.slice(shareLink.fileKey.length))
      .filter((path) => path && !path.includes(".."));
    const archiveFiles = files
      .map((file) => ({ ...file, archivePath: file.fileKey.slice(folderStoragePrefix.length) }))
      .filter((file) => file.archivePath && !file.archivePath.includes(".."));
    const archive = createFolderZipStream(shareLink.userId, rootName, folderPaths, archiveFiles);

    return new NextResponse(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`${rootName}.zip`)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Shared folder ZIP download error");
    return NextResponse.json(
      { error: "Failed to download shared folder" },
      { status: 500 }
    );
  }
}
