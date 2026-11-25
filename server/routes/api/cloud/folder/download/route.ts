import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { and, asc, eq, sql } from "drizzle-orm";
import { cloudFiles, cloudFolders } from "@/db/schema";
import { db } from "@/lib/shared/db";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";
import { createFolderZipStream } from "@/lib/cloud/folder-zip-stream";


const MAX_ZIP_FILES = 500;
const MAX_ZIP_FOLDERS = 1000;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

function normalizeFolderKey(key: string): string {
  const segments = key
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..");

  return segments.length ? `${segments.join("/")}/` : "";
}

function safeZipSegment(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\.+$/g, "").trim() || "folder";
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = await RateLimiters.folderZip(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many folder download requests. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const { searchParams } = new URL(request.url);
    const folderKey = normalizeFolderKey(searchParams.get("key") || "");

    if (!folderKey) {
      return NextResponse.json({ error: "Folder key required" }, { status: 400 });
    }

    const [folder] = await db
      .select({ name: cloudFolders.name, path: cloudFolders.path })
      .from(cloudFolders)
      .where(
        and(
          eq(cloudFolders.userId, userId),
          eq(cloudFolders.isAgentUpload, false),
          eq(cloudFolders.path, folderKey)
        )
      )
      .limit(1);

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const storagePrefix = `users/${userId}/`;
    const folderStoragePrefix = `${storagePrefix}${folderKey}`;
    const folderLikePrefix = `${escapeLikePattern(folderKey)}%`;
    const fileLikePrefix = `${escapeLikePattern(folderStoragePrefix)}%`;
    const [folders, files] = await Promise.all([
      db
        .select({ path: cloudFolders.path })
        .from(cloudFolders)
        .where(
          and(
            eq(cloudFolders.userId, userId),
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
            eq(cloudFiles.userId, userId),
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
          error: "Folder is too large to download",
          maxFiles: MAX_ZIP_FILES,
          maxFolders: MAX_ZIP_FOLDERS,
          maxBytes: MAX_ZIP_BYTES,
        },
        { status: 413 }
      );
    }

    const rootName = safeZipSegment(folder.name);
    const folderPaths = folders
      .map((folder) => folder.path.slice(folderKey.length))
      .filter((path) => path && !path.includes(".."));
    const archiveFiles = files
      .map((file) => ({ ...file, archivePath: file.fileKey.slice(folderStoragePrefix.length) }))
      .filter((file) => file.archivePath && !file.archivePath.includes(".."));
    const archive = createFolderZipStream(userId, rootName, folderPaths, archiveFiles);

    return new NextResponse(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`${rootName}.zip`)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Folder download error");
    return NextResponse.json(
      { error: "Failed to download folder" },
      { status: 500 }
    );
  }
}
