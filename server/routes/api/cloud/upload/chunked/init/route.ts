import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits } from "@/lib/payments/plans";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";
import {
  sanitizeFilename,
  validateFileSize,
} from "@/lib/cloud/upload-validation";
import { chunkedUploadTracker } from "@/lib/cloud/chunked-upload-tracker";


import { shouldSkipEncryption } from "@/lib/shared/encryption-utils";

/**
 * POST /api/cloud/upload/chunked/init
 * Initialize a chunked upload - validates limits, reserves quota, creates multipart upload
 *
 * Request body:
 * - filename: string
 * - size: number (total file size in bytes)
 * - contentType: string
 *
 * Response:
 * - uploadId: string (S3 multipart upload ID)
 * - key: string (sanitized filename)
 * - chunkSize: number (recommended chunk size)
 * - encrypt: boolean (whether client should encrypt chunks)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const rateLimitResult = await RateLimiters.chunkedUploadInit(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Please wait before uploading more files." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const body = await request.json();
    const { filename, size, contentType } = body;

    if (!filename || !Number.isSafeInteger(size) || size <= 0) {
      return NextResponse.json(
        { error: "Filename and valid size required" },
        { status: 400 }
      );
    }
    if (typeof filename !== "string" || (contentType !== undefined &&
      (typeof contentType !== "string" || contentType.length > 100))) {
      return NextResponse.json({ error: "Invalid filename or content type" }, { status: 400 });
    }

    // Sanitize filename
    const safeFilename = sanitizeFilename(filename);

    // Determine encryption mode
    const mimeType = contentType || "application/octet-stream";
    const skipEncryption = shouldSkipEncryption(safeFilename, mimeType);

    // Recommended chunk size: 8MB (aligned with server encryption chunk size)
    const chunkSize = 8 * 1024 * 1024;

    // Get user and plan limits
    const dbUser = await dbService.getUser(userId, email);
    const limits = getPlanLimits(dbUser.plan);

    // Validate file size against plan limits (no side effects)
    const fileSizeError = validateFileSize(size, limits, dbUser.plan);
    if (fileSizeError) {
      return NextResponse.json(fileSizeError, { status: 402 });
    }

    const reservation = await chunkedUploadTracker.reserveUpload({
      userId, key: safeFilename, size, contentType: mimeType, encrypted: !skipEncryption,
      maxStorageBytes: limits.maxStorageBytes, maxFileCount: limits.maxFileCount,
    });
    if (!reservation.success) {
      if (reservation.reason === "conflict") {
        return NextResponse.json(
          { error: "Another upload for this file is already in progress. Please wait or cancel it." },
          { status: 409 }
        );
      }
      if (reservation.reason === "surface") {
        return NextResponse.json({ error: "An Agent Storage file already exists at this path" }, { status: 409 });
      }
      return NextResponse.json(
        { error: "Storage or file count limit exceeded.", code: "STORAGE_LIMIT" }, { status: 402 }
      );
    }

    let uploadId: string | undefined;
    try {
      uploadId = await systemStorage.createMultipartUpload(userId, safeFilename, mimeType, reservation.upload.id);
      await chunkedUploadTracker.activateUpload(reservation.upload.id, userId, uploadId);
      cloudLog.info({ filename: safeFilename, size }, "Chunked upload initiated");
      return NextResponse.json({
        uploadId, key: safeFilename, chunkSize, encrypt: !skipEncryption,
        quotaReserved: reservation.upload.reservedBytes, isOverwrite: !reservation.upload.isNewFile,
      });
    } catch (error) {
      // Keep the persisted reservation until R2 abort and quota rollback succeed.
      if (uploadId) await systemStorage.abortMultipartUpload(userId, safeFilename, uploadId);
      await chunkedUploadTracker.abortReservation(reservation.upload.id, userId);
      throw error;
    }
  } catch (error) {
    cloudLog.error({ err: error }, "Chunked init error");
    return NextResponse.json(
      { error: "Failed to initialize upload" },
      { status: 500 }
    );
  }
}
