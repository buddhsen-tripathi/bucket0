import { runInBackground } from "@/server/context";
import { NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits, formatBytes } from "@/lib/payments/plans";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import { enqueueThumbnail } from "@/lib/cloud/background-jobs";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Parse pagination parameters
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    // Ensure user exists and get their usage
    const dbUser = await dbService.getUser(userId, email);
    const [allFiles, agentFileKeys] = await Promise.all([
      systemStorage.listFiles(userId),
      db.select({ fileKey: cloudFiles.fileKey })
        .from(cloudFiles)
        .where(and(eq(cloudFiles.userId, userId), eq(cloudFiles.isAgentUpload, true))),
    ]);
    const limits = getPlanLimits(dbUser.plan);

    // Exclude agent-uploaded files from the cloud drive listing
    const agentKeySet = new Set(agentFileKeys.map(f => f.fileKey.replace(`users/${userId}/`, "")));
    const personalFiles = allFiles.filter(f => !agentKeySet.has(f.key));

    // Sort files by lastModified descending (newest first) for consistent pagination
    const sortedFiles = [...personalFiles].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    // Get total count before pagination
    const totalCount = sortedFiles.length;

    // Apply pagination
    const paginatedFiles = sortedFiles.slice(offset, offset + limit);

    // Get thumbnail info and starred status from database only for paginated files
    const fileRecords = await db.select({
      id: cloudFiles.id,
      fileKey: cloudFiles.fileKey,
      thumbnailKey: cloudFiles.thumbnailKey,
      thumbnailAttempted: cloudFiles.thumbnailAttempted,
      mimeType: cloudFiles.mimeType,
      encrypted: cloudFiles.encrypted,
      encryptionMode: cloudFiles.encryptionMode,
      isStarred: cloudFiles.isStarred,
      isAgentUpload: cloudFiles.isAgentUpload,
    }).from(cloudFiles).where(eq(cloudFiles.userId, userId));

    // Create a map for quick lookup
    const thumbnailMap = new Map(
      fileRecords.map(f => [f.fileKey, {
        id: f.id,
        thumbnailKey: f.thumbnailKey,
        thumbnailAttempted: f.thumbnailAttempted,
        mimeType: f.mimeType,
        encrypted: f.encrypted,
        encryptionMode: f.encryptionMode,
        isStarred: f.isStarred,
        isAgentUpload: f.isAgentUpload,
      }])
    );

    // Find files that need thumbnail generation (not attempted yet, no thumbnail, supported type)
    // Only process files in the current page
    const filesToGenerateThumbnails: typeof fileRecords = [];
    for (const file of paginatedFiles) {
      const fullKey = `users/${userId}/${file.key}`;
      const dbInfo = thumbnailMap.get(fullKey);
      if (
        dbInfo &&
        !dbInfo.thumbnailKey &&
        !dbInfo.thumbnailAttempted &&
        dbInfo.mimeType &&
        supportsThumbnail(dbInfo.mimeType)
      ) {
        filesToGenerateThumbnails.push({
          id: dbInfo.id,
          fileKey: fullKey,
          thumbnailKey: dbInfo.thumbnailKey,
          thumbnailAttempted: dbInfo.thumbnailAttempted,
          mimeType: dbInfo.mimeType,
          encrypted: dbInfo.encrypted,
          encryptionMode: dbInfo.encryptionMode,
          isStarred: dbInfo.isStarred,
          isAgentUpload: dbInfo.isAgentUpload,
        });
      }
    }

    // Queue thumbnail generation for files without thumbnails (fire-and-forget)
    // Limit to 5 at a time to avoid overwhelming the server
    const filesToProcess = filesToGenerateThumbnails.slice(0, 5);
    if (filesToProcess.length > 0) {
      for (const file of filesToProcess) {
        await runInBackground(enqueueThumbnail(userId, file.fileKey)
          .catch(err => cloudLog.error({ err }, "Thumb-regen background error")));
      }
    }

    // Merge thumbnail info and starred status with files (only expose whether thumbnail exists, not the path)
    const filesWithThumbnails = paginatedFiles.map(file => {
      const fullKey = `users/${userId}/${file.key}`;
      const dbInfo = thumbnailMap.get(fullKey);
      return {
        ...file,
        hasThumbnail: !!dbInfo?.thumbnailKey,
        mimeType: dbInfo?.mimeType || null,
        isStarred: dbInfo?.isStarred ?? false,
        isAgentUpload: dbInfo?.isAgentUpload ?? false,
      };
    });

    return NextResponse.json({
      files: filesWithThumbnails,
      usage: Number(dbUser.storageUsage),
      limit: limits.maxStorageBytes,
      plan: dbUser.plan,
      maxFileSize: limits.maxFileSizeBytes,
      maxFileSizeFormatted: formatBytes(limits.maxFileSizeBytes),
      usageFormatted: formatBytes(dbUser.storageUsage),
      limitFormatted: formatBytes(limits.maxStorageBytes),
      // Pagination metadata
      pagination: {
        total: totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Cloud listing error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list files" },
      { status: 500 }
    );
  }
}
