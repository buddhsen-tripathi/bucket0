import { enqueueIndex, enqueueThumbnail } from "@/lib/cloud/background-jobs";
import { runInBackground } from "@/server/context";
/**
 * Agent File Upload
 *
 * POST /api/agent-bucket/files/upload - Upload a file via Bearer token auth
 *
 * Files are stored in the same R2 path as personal files (users/{userId}/...)
 * but marked with isAgentUpload=true in the database.
 *
 * The key's destination setting determines where the file lands:
 * - destination="agent" → isAgentUpload=true (Agent Storage tab)
 * - destination="drive" → isAgentUpload=false (My Drive, optionally in a folder)
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { Readable } from "stream";
import { systemStorage } from "@/lib/cloud/system-service";
import { getPlanLimits } from "@/lib/payments/plans";
import { db } from "@/lib/shared/db";
import { cloudFiles, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { agentLog } from "@/lib/shared/logger";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import {
  sanitizeFilename,
  validateFileSize,
  handleStorageQuota,
  rollbackStorageQuota,
} from "@/lib/cloud/upload-validation";
import { createEncryptStream } from "@/lib/cloud/encryption-service";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { shouldSkipEncryption } from "@/lib/shared/encryption-utils";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";
import { isValidDestinationFolder } from "@/lib/agent/agent-key-service";
import { isTextLike } from "@/lib/agent/memory-service";


/** Max file size eligible for semantic indexing (text only). */
const MEMORY_INDEX_MAX_BYTES = 1_000_000;

/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    // Bearer token auth
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId, keyId, destination, destinationFolder } = authResult;

    // Rate limiting
    const rateLimitResult = await RateLimiters.fileUpload(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Please wait before uploading more files." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    // Parse multipart form data
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string | null) || file?.name;

    if (!file || !filename) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Reject path traversal explicitly (consistent with the folder endpoint and the
    // documented "no .." rule) rather than silently sanitizing it away.
    if (filename.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const size = file.size;
    const fileContentType = file.type || "application/octet-stream";

    // Build the storage path based on destination setting
    let safeFilename = sanitizeFilename(filename);
    if (destination === "drive" && destinationFolder) {
      // Keys saved before folder validation existed may hold an unsafe value
      if (!isValidDestinationFolder(destinationFolder)) {
        return NextResponse.json({ error: "Invalid destination folder on this API key" }, { status: 400 });
      }
      // Prepend the destination folder
      const folder = destinationFolder.endsWith("/") ? destinationFolder : `${destinationFolder}/`;
      safeFilename = `${folder}${safeFilename}`;
    }

    const isAgentUpload = destination === "agent";

    // Get user and validate plan limits
    const [dbUser] = await db
      .select({ plan: users.plan, storageUsage: users.storageUsage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const limits = getPlanLimits(dbUser.plan);
    const fileSizeError = validateFileSize(size, limits, dbUser.plan);
    if (fileSizeError) {
      return NextResponse.json(fileSizeError, { status: 402 });
    }

    // AgentBucket+ memory is ON by default for memory-eligible plans. The agent
    // opts a file out per upload by sending index=false. Text files only, size-capped.
    // Indexed by the background queue after the file is committed.
    const indexParam = formData.get("index");
    const wantIndex = !(typeof indexParam === "string" && /^(false|0|no|off)$/i.test(indexParam.trim()));
    const shouldIndex =
      wantIndex &&
      limits.memoryEnabled &&
      isTextLike(fileContentType, safeFilename) &&
      size <= MEMORY_INDEX_MAX_BYTES;

    // Reserve quota
    const quotaResult = await handleStorageQuota(userId, size, safeFilename, dbUser, limits, isAgentUpload);
    if (quotaResult.surfaceConflict) {
      return NextResponse.json({ error: "A file already exists at this path" }, { status: 409 });
    }
    if (!quotaResult.success) {
      return NextResponse.json(quotaResult.error, { status: 402 });
    }

    try {
      const skipEncryption = shouldSkipEncryption(safeFilename, fileContentType);
      const encryptionMode = skipEncryption ? "none" : "chunked_gcm";

      // Streaming upload
      const webStream = file.stream();
      const nodeStream = Readable.fromWeb(webStream as import("stream/web").ReadableStream);

      let uploadStream: Readable;
      if (skipEncryption) {
        uploadStream = nodeStream;
      } else {
        uploadStream = nodeStream.pipe(createEncryptStream());
      }

      await systemStorage.uploadFileStream(userId, safeFilename, uploadStream, fileContentType);

      // Save metadata
      const fileKey = `users/${userId}/${safeFilename}`;

      const existingFile = await db
        .select()
        .from(cloudFiles)
        .where(and(eq(cloudFiles.userId, userId), eq(cloudFiles.fileKey, fileKey)))
        .limit(1);

      const fileData = {
        fileSize: size,
        mimeType: fileContentType,
        encrypted: encryptionMode === "chunked_gcm",
        encryptionMode,
        iv: "00000000000000000000000000000000",
        authTag: null,
        thumbnailKey: null,
        isAgentUpload,
        uploadedVia: keyId,
        folderPath: cloudCatalog.deriveFolderPath(userId, fileKey),
        updatedAt: new Date(),
      };

      let fileId: string;
      if (existingFile.length > 0) {
        fileId = existingFile[0].id;
        await db
          .update(cloudFiles)
          .set(fileData)
          .where(eq(cloudFiles.id, fileId));
      } else {
        const [inserted] = await db
          .insert(cloudFiles)
          .values({
            userId,
            fileKey,
            fileName: safeFilename,
            ...fileData,
          })
          .returning({ id: cloudFiles.id });
        fileId = inserted.id;
      }

      await cloudCatalog
        .onFileWritten(userId, fileKey, { isAgentUpload })
        .catch((err) => agentLog.error({ err }, "catalog folder sync failed"));

      if (supportsThumbnail(fileContentType)) {
        await runInBackground(enqueueThumbnail(userId, fileKey, "personal").catch(
          (err) => agentLog.error({ err, filename: safeFilename }, "Agent thumbnail failed")
        ));
      }

      if (shouldIndex) await enqueueIndex(fileId, keyId, limits.maxMemoryChunks);

      agentLog.info({ filename: safeFilename, size, destination }, "Agent file uploaded");

      return NextResponse.json({
        success: true,
        key: safeFilename,
        fileName: safeFilename.split("/").pop(),
        size,
        destination,
      });
    } catch (err) {
      agentLog.error({ err, filename: safeFilename }, "Agent upload failed");
      await rollbackStorageQuota(userId, size, quotaResult.isNewFile, quotaResult.existingSize);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (error) {
    agentLog.error({ err: error }, "Agent upload critical error");
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
