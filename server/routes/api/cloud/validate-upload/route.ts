import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { dbService } from "@/lib/shared/db-service";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { formatBytes } from "@/lib/payments/plans";
import { sanitizeFilename } from "@/lib/cloud/upload-validation";
import { cloudLog } from "@/lib/shared/logger";

/**
 * Pre-upload validation endpoint
 * Checks if an upload would be allowed before actually uploading
 * This saves bandwidth by rejecting oversized files early
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, size } = body;

    if (!filename || size === undefined || size === null) {
      return NextResponse.json(
        { error: "Filename and size required" },
        { status: 400 }
      );
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Ensure user exists
    await dbService.getUser(userId, email);

    // Sanitize filename but preserve folder structure
    const safeFilename = sanitizeFilename(filename);

    // Check if this is an overwrite via DB (avoids R2 HeadObject round-trip)
    const fileKey = `users/${userId}/${safeFilename}`;
    const [existingFile] = await db
      .select({ fileSize: cloudFiles.fileSize })
      .from(cloudFiles)
      .where(and(eq(cloudFiles.userId, userId), eq(cloudFiles.fileKey, fileKey)))
      .limit(1);

    const existingSize = existingFile?.fileSize ?? 0;
    const isNewFile = !existingFile;
    const effectiveSize = isNewFile ? size : Math.max(0, size - existingSize);

    // Validate the upload
    const validation = await dbService.validateUploadAllowed(
      userId,
      effectiveSize,
      isNewFile
    );

    if (!validation.allowed) {
      const limits = await dbService.getUserLimits(userId);
      return NextResponse.json(
        {
          allowed: false,
          error: validation.error,
          limits: limits
            ? {
                plan: limits.plan,
                storageUsage: limits.storageUsage,
                storageLimit: limits.storageLimit,
                storageUsageFormatted: formatBytes(limits.storageUsage),
                storageLimitFormatted: formatBytes(limits.storageLimit),
                maxFileSizeBytes: limits.maxFileSizeBytes,
                maxFileSizeFormatted: formatBytes(limits.maxFileSizeBytes),
              }
            : null,
        },
        { status: 402 }
      );
    }

    const limits = await dbService.getUserLimits(userId);
    return NextResponse.json({
      allowed: true,
      isOverwrite: !isNewFile,
      limits: limits
        ? {
            plan: limits.plan,
            storageUsage: limits.storageUsage,
            storageLimit: limits.storageLimit,
            storageUsageFormatted: formatBytes(limits.storageUsage),
            storageLimitFormatted: formatBytes(limits.storageLimit),
            maxFileSizeBytes: limits.maxFileSizeBytes,
            maxFileSizeFormatted: formatBytes(limits.maxFileSizeBytes),
            remainingStorage: limits.storageLimit - limits.storageUsage,
            remainingStorageFormatted: formatBytes(
              limits.storageLimit - limits.storageUsage
            ),
          }
        : null,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Upload validation error");
    return NextResponse.json(
      { error: "Failed to validate upload" },
      { status: 500 }
    );
  }
}
