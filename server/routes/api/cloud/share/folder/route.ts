import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFiles, cloudFolders, shareLinks } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";
import { getClientIp } from "@/lib/shared/http-utils";

function normalizeRelativeFolder(path: string): string {
  const segments = path.split("/").filter((segment) => segment && segment !== "..");
  return segments.length ? `${segments.join("/")}/` : "";
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimitResult = await RateLimiters.shareStream(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("id");
    const requestedPath = normalizeRelativeFolder(searchParams.get("path") || "");

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

    if (shareLink.accessType === "protected") {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    const currentPath = `${shareLink.fileKey}${requestedPath}`;

    const [folders, files] = await Promise.all([
      db
        .select({
          path: cloudFolders.path,
          name: cloudFolders.name,
          createdAt: cloudFolders.createdAt,
        })
        .from(cloudFolders)
        .where(
          and(
            eq(cloudFolders.userId, shareLink.userId),
            eq(cloudFolders.isAgentUpload, false),
            eq(cloudFolders.parentPath, currentPath)
          )
        )
        .orderBy(asc(cloudFolders.name)),
      db
        .select({
          fileKey: cloudFiles.fileKey,
          fileName: cloudFiles.fileName,
          fileSize: cloudFiles.fileSize,
          mimeType: cloudFiles.mimeType,
          updatedAt: cloudFiles.updatedAt,
        })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, shareLink.userId),
            eq(cloudFiles.isAgentUpload, false),
            eq(cloudFiles.folderPath, currentPath),
            sql`${cloudFiles.fileKey} NOT LIKE '%/'`
          )
        )
        .orderBy(asc(cloudFiles.fileName)),
    ]);

    return NextResponse.json({
      linkId,
      rootPath: shareLink.fileKey,
      path: requestedPath,
      name: shareLink.fileName,
      allowDownload: shareLink.allowDownload,
      folders: folders.map((folder) => ({
        name: folder.name,
        path: folder.path.slice(shareLink.fileKey.length),
        createdAt: folder.createdAt,
      })),
      files: files.map((file) => ({
        key: file.fileKey.startsWith(`users/${shareLink.userId}/`)
          ? file.fileKey.slice(`users/${shareLink.userId}/`.length)
          : file.fileKey,
        name: file.fileName,
        size: file.fileSize,
        mimeType: file.mimeType,
        updatedAt: file.updatedAt,
      })),
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Shared folder listing error");
    return NextResponse.json(
      { error: "Failed to list shared folder" },
      { status: 500 }
    );
  }
}
