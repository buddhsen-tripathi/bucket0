import { enqueueThumbnail } from "@/lib/cloud/background-jobs";
import { runInBackground } from "@/server/context";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { Readable } from "stream";
import { systemStorage } from "@/lib/cloud/system-service";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits } from "@/lib/payments/plans";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import {
  sanitizeFilename,
  validateFileSize,
  handleStorageQuota,
  rollbackStorageQuota,
} from "@/lib/cloud/upload-validation";
import {
  createEncryptStream,
} from "@/lib/cloud/encryption-service";

// Configure route for large file uploads

import { shouldSkipEncryption } from "@/lib/shared/encryption-utils";

/**
 * Save or update file metadata in database
 */
async function saveFileMetadata(
  userId: string,
  safeFilename: string,
  originalSize: number,
  mimeType: string,
  encryptionMode: "chunked_gcm" | "none"
) {
  const fileKey = `users/${userId}/${safeFilename}`;

  const existingFile = await db
    .select()
    .from(cloudFiles)
    .where(and(eq(cloudFiles.userId, userId), eq(cloudFiles.fileKey, fileKey)))
    .limit(1);

  const fileData = {
    fileSize: originalSize, // Store original size for user display
    mimeType,
    encrypted: encryptionMode === "chunked_gcm",
    encryptionMode,
    // For chunked encryption, IV and authTag are embedded in the file
    iv: "00000000000000000000000000000000",
    authTag: null,
    thumbnailKey: null, // Reset - will be updated by background job
    isAgentUpload: false, // An owner Drive upload always lands in My Drive
    uploadedVia: null,
    folderPath: cloudCatalog.deriveFolderPath(userId, fileKey),
    updatedAt: new Date(),
  };

  if (existingFile.length > 0) {
    await db
      .update(cloudFiles)
      .set(fileData)
      .where(eq(cloudFiles.id, existingFile[0].id));
  } else {
    await db.insert(cloudFiles).values({
      userId,
      fileKey,
      fileName: safeFilename,
      ...fileData,
    });
  }

  // Keep the folder catalog in sync (best-effort; reconciliation job is the backstop).
  await cloudCatalog
    .onFileWritten(userId, fileKey, { isAgentUpload: false })
    .catch((err) => cloudLog.error({ err }, "catalog folder sync failed"));
}

// Server-proxied upload - all traffic goes through our server
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Apply rate limiting: 100 uploads per minute
    const rateLimitResult = await RateLimiters.fileUpload(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error:
            "Upload rate limit exceeded. Please wait before uploading more files.",
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    // Validate email
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Get user and plan limits
    const dbUser = await dbService.getUser(userId, email);
    const limits = getPlanLimits(dbUser.plan);

    const contentType = request.headers.get("content-type") || "";

    // Handle multipart form data (file upload)
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipartUpload(request, userId, dbUser, limits);
    }

    // Handle JSON request (presigned URL flow, used by the mobile app)
    return handleJsonUpload(request, userId, dbUser, limits);
  } catch (error) {
    cloudLog.error({ err: error }, "Critical upload error");


    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

/**
 * Handle multipart form data upload (direct file upload)
 */
async function handleMultipartUpload(
  request: NextRequest,
  userId: string,
  dbUser: { plan: string; storageUsage: number },
  limits: ReturnType<typeof getPlanLimits>
) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const filename = formData.get("filename") as string | null;

  if (!file || !filename) {
    return NextResponse.json(
      { error: "File and filename required" },
      { status: 400 }
    );
  }

  const size = file.size;
  const fileContentType = file.type || "application/octet-stream";

  // Sanitize filename early for logging
  const safeFilename = sanitizeFilename(filename);

  // Validate file size against plan limits (check early, before queueing)
  const fileSizeError = validateFileSize(size, limits, dbUser.plan);
  if (fileSizeError) {
    return NextResponse.json(fileSizeError, { status: 402 });
  }

  // Handle storage quota (reserves space or returns error)
  const quotaResult = await handleStorageQuota(
    userId,
    size,
    safeFilename,
    dbUser,
    limits
  );
  if (quotaResult.surfaceConflict) {
    return NextResponse.json({ error: "An Agent Storage file already exists at this path" }, { status: 409 });
  }
  if (!quotaResult.success) {
    return NextResponse.json(quotaResult.error, { status: 402 });
  }

  try {

    // Check if this file type should skip encryption
    const skipEncryption = shouldSkipEncryption(safeFilename, fileContentType);
    const encryptionMode = skipEncryption ? "none" : "chunked_gcm";

    await handleStreamingUpload(
      file,
      userId,
      safeFilename,
      size,
      fileContentType,
      skipEncryption
    );

    // Save metadata to database
    await saveFileMetadata(
      userId,
      safeFilename,
      size,
      fileContentType,
      encryptionMode
    );

    if (supportsThumbnail(fileContentType)) {
      await runInBackground(enqueueThumbnail(userId, `users/${userId}/${safeFilename}`, "personal").catch(
        (err) => cloudLog.error({ err, filename: safeFilename }, "Thumbnail failed")
      ));
    }

    cloudLog.info({ filename: safeFilename, size, encrypted: !skipEncryption }, "File uploaded");
    return NextResponse.json({ success: true, key: safeFilename });
  } catch (err) {
    cloudLog.error({ err, filename: safeFilename }, "Upload failed");

    await rollbackStorageQuota(
      userId,
      size,
      quotaResult.isNewFile,
      quotaResult.existingSize
    );

    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

/**
 * Handle streaming upload
 * Uses stream-based encryption and multipart upload to R2
 */
async function handleStreamingUpload(
  file: File,
  userId: string,
  safeFilename: string,
  size: number,
  contentType: string,
  skipEncryption: boolean
) {
  // Get web stream from file and convert to node stream
  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(webStream as import("stream/web").ReadableStream);

  let uploadStream: Readable;

  if (skipEncryption) {
    // Upload directly without encryption
    uploadStream = nodeStream;
  } else {
    // Create encryption transform stream and pipe
    const encryptStream = createEncryptStream();
    uploadStream = nodeStream.pipe(encryptStream);
  }

  // Upload stream to R2
  await systemStorage.uploadFileStream(
    userId,
    safeFilename,
    uploadStream,
    contentType
  );

}

/**
 * Handle JSON request for presigned URL upload (used by the mobile app)
 */
async function handleJsonUpload(
  request: NextRequest,
  userId: string,
  dbUser: { plan: string; storageUsage: number },
  limits: ReturnType<typeof getPlanLimits>
) {
  const body = await request.json();
  const { filename, contentType: bodyContentType, size } = body;

  if (!filename || !Number.isSafeInteger(size) || size < 0) {
    return NextResponse.json(
      { error: "Filename and a valid size required" },
      { status: 400 }
    );
  }

  // Validate file size against plan limits
  const fileSizeError = validateFileSize(size, limits, dbUser.plan);
  if (fileSizeError) {
    return NextResponse.json(fileSizeError, { status: 402 });
  }

  // Sanitize filename
  const safeFilename = sanitizeFilename(filename);

  // Handle storage quota
  const quotaResult = await handleStorageQuota(
    userId,
    size,
    safeFilename,
    dbUser,
    limits
  );
  if (quotaResult.surfaceConflict) {
    return NextResponse.json({ error: "An Agent Storage file already exists at this path" }, { status: 409 });
  }
  if (!quotaResult.success) {
    return NextResponse.json(quotaResult.error, { status: 402 });
  }

  const finalContentType = bodyContentType || "application/octet-stream";
  const uploadUrl = await systemStorage.getUploadUrl(
    userId,
    safeFilename,
    finalContentType
  );

  return NextResponse.json({ uploadUrl });
}
