import { enqueueThumbnail } from "@/lib/cloud/background-jobs";
import { runInBackground } from "@/server/context";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { S3ServiceException, type CompletedPart } from "@aws-sdk/client-s3";
import { cloudLog } from "@/lib/shared/logger";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { chunkedUploadTracker } from "@/lib/cloud/chunked-upload-tracker";

/**
 * POST /api/cloud/upload/chunked/complete
 * Complete a chunked upload
 *
 * Request body:
 * - uploadId: string
 * - key: string (sanitized filename)
 * - parts: Array<{ partNumber: number; etag: string }>
 * - size: number (original file size)
 * - contentType: string
 * - encrypted: boolean
 *
 * Response:
 * - success: boolean
 * - key: string
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uploadId, key, parts } = body;

    if (!uploadId || !key || !parts || !Array.isArray(parts) || parts.length === 0) {
      return NextResponse.json(
        { error: "uploadId, key, and parts array are required" },
        { status: 400 }
      );
    }

    // Validate parts array
    for (const part of parts) {
      if (!part || typeof part !== "object" || !Number.isInteger(part.partNumber) || part.partNumber < 1 ||
        typeof part.etag !== "string" || !part.etag) {
        return NextResponse.json(
          { error: "Each part must have partNumber (number) and etag (string)" },
          { status: 400 }
        );
      }
    }

    // Sort parts by part number (S3 requires this)
    const sortedParts: CompletedPart[] = parts
      .sort((a: { partNumber: number }, b: { partNumber: number }) => a.partNumber - b.partNumber)
      .map((p: { partNumber: number; etag: string }) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
      }));

    const existingUpload = await chunkedUploadTracker.getUpload(userId, uploadId);
    if (!existingUpload || existingUpload.key !== key || !["active", "completing"].includes(existingUpload.state)) {
      return NextResponse.json({ error: "Upload not found or being aborted" }, { status: 409 });
    }
    const expectedParts = Math.ceil(existingUpload.size / (8 * 1024 * 1024));
    if (sortedParts.length !== expectedParts || sortedParts.some((part, i) => part.PartNumber !== i + 1)) {
      return NextResponse.json({ error: "Missing or duplicate upload parts" }, { status: 400 });
    }
    const upload = await chunkedUploadTracker.startCompletion(userId, uploadId, key);
    if (!upload) {
      return NextResponse.json({ error: "Upload not found or being aborted" }, { status: 409 });
    }
    try {
      await systemStorage.completeMultipartUpload(userId, key, uploadId, sortedParts);
    } catch (error) {
      // R2 may have committed even if the completion response was lost. The
      // unique object token allows a retry to finish metadata without double charging.
      if (!(await chunkedUploadTracker.objectWasCompleted(upload))) {
        const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
        if (status && status >= 400 && status < 500 && error instanceof S3ServiceException && error.name !== "NoSuchUpload") {
          // A definitive rejection leaves the multipart upload available for retry or cancellation.
          // Transport/server failures remain protected because R2 may still complete them.
          await chunkedUploadTracker.resumeUpload(userId, uploadId, upload.operationToken);
        }
        throw error;
      }
    }
    await chunkedUploadTracker.completeUpload(userId, uploadId);
    const fileKey = `users/${userId}/${key}`;
    const contentType = upload.contentType;

    // Keep the folder catalog in sync (best-effort).
    await cloudCatalog
      .onFileWritten(userId, fileKey, { isAgentUpload: false })
      .catch((err) => cloudLog.error({ err }, "catalog folder sync failed"));

    // Queue thumbnail generation (fire-and-forget)
    const mimeType = contentType || "application/octet-stream";
    if (supportsThumbnail(mimeType)) {
      await runInBackground(enqueueThumbnail(userId, fileKey).catch(
        (err) => cloudLog.error({ err }, "Chunked thumb background error")
      ));
    }

    cloudLog.info({ key, parts: parts?.length }, "Chunked upload completed");
    return NextResponse.json({
      success: true,
      key,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Chunked complete error");
    return NextResponse.json(
      { error: "Failed to complete upload" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cloud/upload/chunked/complete
 * Abort a chunked upload (cleanup on failure)
 *
 * Request body:
 * - uploadId: string
 * - key: string
 * - size: number (file size for quota rollback)
 * - isOverwrite: boolean (optional, from init response)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uploadId, key } = body;

    if (!uploadId || !key) {
      return NextResponse.json(
        { error: "uploadId and key are required" },
        { status: 400 }
      );
    }

    const aborted = await chunkedUploadTracker.abortUpload(userId, uploadId, key);
    if (!aborted) {
      return NextResponse.json({ error: "Upload is being completed or key does not match" }, { status: 409 });
    }

    cloudLog.info({ uploadId: uploadId.substring(0, 8) }, "Chunked upload aborted");
    return NextResponse.json({ success: true });
  } catch (error) {
    cloudLog.error({ err: error }, "Chunked abort error");
    return NextResponse.json(
      { error: "Failed to abort upload" },
      { status: 500 }
    );
  }
}
