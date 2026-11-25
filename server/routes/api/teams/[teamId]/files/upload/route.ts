import { enqueueThumbnail } from "@/lib/cloud/background-jobs";
import { runInBackground } from "@/server/context";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { Readable } from "stream";
import { systemStorage } from "@/lib/cloud/system-service";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import { sanitizeFilename } from "@/lib/cloud/upload-validation";
import {
  encryptBufferChunked,
  createEncryptStream,
} from "@/lib/cloud/encryption-service";
import { shouldSkipEncryption } from "@/lib/shared/encryption-utils";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { Permission } from "@/lib/teams/permission-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { teamFileService } from "@/lib/teams/team-file-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    // Check upload permission
    const permError = await requireTeamPermission(teamId, userId, Permission.UPLOAD);
    if (permError) return permError;

    // Rate limit: 100 uploads per minute per user
    const rateLimitResult = await RateLimiters.fileUpload(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Please wait before uploading more files." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Multipart form data required" },
        { status: 400 }
      );
    }

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
    const safeFilename = sanitizeFilename(filename);
    const fileKey = `teams/${teamId}/${safeFilename}`;

    // Check if this file type should skip encryption
    const skipEncryption = shouldSkipEncryption(safeFilename, fileContentType);
    const encryptionMode = skipEncryption ? "none" : "chunked_gcm";

    // Validate file size against owner's plan limits BEFORE reserving quota
    const validation = await teamQuotaService.validateTeamUploadAllowed(teamId, size, true);
    if (!validation.allowed) {
      const statusCode = validation.error?.code === "FILE_SIZE_LIMIT" ? 413
        : validation.error?.code === "STORAGE_LIMIT" ? 413
        : validation.error?.code === "FILE_COUNT_LIMIT" ? 413
        : 400;
      return NextResponse.json(
        { error: validation.error?.message || "Upload not allowed", code: validation.error?.code },
        { status: statusCode }
      );
    }

    // Reserve quota atomically BEFORE upload (updates both owner + team)
    const quotaResult = await teamQuotaService.reserveQuotaAtomic(teamId, fileKey, size);
    if (!quotaResult.success) {
      if (quotaResult.quotaExceeded) {
        return NextResponse.json(
          { error: "Storage quota exceeded. The team owner's plan does not have enough storage." },
          { status: 413 }
        );
      }
      return NextResponse.json(
        { error: "Failed to reserve storage quota" },
        { status: 500 }
      );
    }

    // Streaming threshold (25MB)
    const STREAM_SIZE_THRESHOLD = 25 * 1024 * 1024;
    const useStreaming = size > STREAM_SIZE_THRESHOLD;

    try {
      if (useStreaming) {
        // Streaming upload for large files
        const webStream = file.stream();
        const nodeStream = Readable.fromWeb(webStream as import("stream/web").ReadableStream);

        let uploadStream: Readable;

        if (skipEncryption) {
          uploadStream = nodeStream;
        } else {
          const encryptStream = createEncryptStream();
          uploadStream = nodeStream.pipe(encryptStream);
        }

        await systemStorage.uploadTeamFileStream(
          teamId,
          safeFilename,
          uploadStream,
          fileContentType
        );
      } else {
        // Buffer-based upload for small files
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadBuffer = skipEncryption ? buffer : encryptBufferChunked(buffer);

        await systemStorage.uploadTeamFile(teamId, safeFilename, uploadBuffer, fileContentType);
      }
    } catch (uploadError) {
      // Rollback quota on upload failure
      await teamQuotaService.rollbackQuota(teamId, size, quotaResult.isNewFile ? 1 : 0);
      throw uploadError;
    }

    // Save metadata to database (rollback quota if this fails)
    try {
      await teamFileService.saveFileMetadata({
        teamId,
        uploadedBy: userId,
        fileName: safeFilename,
        fileKey,
        fileSize: size,
        mimeType: fileContentType,
        encryptionMode,
      });
    } catch (metadataError) {
      teamLog.error({ err: metadataError }, "Metadata save failed, rolling back quota");
      await teamQuotaService.rollbackQuota(teamId, size, quotaResult.isNewFile ? 1 : 0);
      throw metadataError;
    }

    if (supportsThumbnail(fileContentType)) {
      await runInBackground(enqueueThumbnail(teamId, fileKey, "team").catch(
        (err) => teamLog.error({ err, filename: safeFilename }, "Thumbnail failed")
      ));
    }

    // Activity logging is done in batch by the client after all uploads complete
    teamLog.info({ filename: safeFilename, size }, "Team file uploaded");

    return NextResponse.json({ success: true, key: safeFilename, size });
  } catch (error) {
    teamLog.error({ err: error }, "Error uploading file");
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
