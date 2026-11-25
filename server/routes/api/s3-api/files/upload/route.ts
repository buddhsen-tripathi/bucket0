/**
 * S3 API Files Upload - Web UI endpoint
 * Uses Clerk session auth
 *
 * POST /api/s3-api/files/upload?bucket=xxx&key=xxx
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import {
  s3ApiBucketService,
  s3ApiStorageService,
  s3ApiQuotaService,
  acquireObjectLease,
  releaseObjectLease,
} from "@/lib/s3-api";
import { s3ApiLog } from "@/lib/shared/logger";

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = request.nextUrl.searchParams.get("bucket");
  const key = request.nextUrl.searchParams.get("key");

  if (!bucketName || !key) {
    return NextResponse.json({ error: "Bucket and key are required" }, { status: 400 });
  }

  // Verify bucket exists and belongs to user
  const bucket = await s3ApiBucketService.getBucket(userId, bucketName);
  if (!bucket) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  // Read the body before taking the lease so a slow upload does not hold it
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const body = Buffer.from(await request.arrayBuffer());
  const contentLength = body.length;

  // Serialize writes/deletes per object so the size read and quota change happen once
  const lease = await acquireObjectLease(userId, bucketName, key);
  if (!lease) {
    return NextResponse.json({ error: "Another change to this file is in progress. Try again." }, { status: 409 });
  }

  try {
    // Check if existing object
    const existingSize = await s3ApiStorageService.getObjectSize(userId, bucketName, key);

    // Check quota
    if (existingSize === 0) {
      const quotaCheck = await s3ApiQuotaService.checkUploadAllowed(userId, contentLength);

      if (!quotaCheck.allowed) {
        return NextResponse.json(
          { error: quotaCheck.error?.message || "Upload not allowed" },
          { status: 403 }
        );
      }

      // Reserve quota
      const quotaResult = await s3ApiQuotaService.reserveQuota(userId, contentLength);
      if (!quotaResult.success) {
        return NextResponse.json({ error: "Storage quota exceeded" }, { status: 403 });
      }
    } else {
      // Replacing existing - adjust quota
      const quotaResult = await s3ApiQuotaService.adjustQuotaForReplace(
        userId,
        existingSize,
        contentLength
      );

      if (!quotaResult.success && quotaResult.quotaExceeded) {
        return NextResponse.json({ error: "Storage quota exceeded" }, { status: 403 });
      }
    }

    // Upload to R2; undo the quota change if it fails
    let result;
    try {
      result = await s3ApiStorageService.putObject(
        userId,
        bucketName,
        key,
        body,
        contentType,
        contentLength
      );
    } catch (error) {
      if (existingSize === 0) {
        await s3ApiQuotaService.releaseQuota(userId, contentLength);
      } else {
        await s3ApiQuotaService.adjustQuotaForReplace(userId, contentLength, existingSize);
      }
      throw error;
    }

    // Update bucket stats
    const countChange = existingSize === 0 ? 1 : 0;
    const storageChange = contentLength - existingSize;
    await s3ApiQuotaService.updateBucketStats(userId, bucketName, storageChange, countChange);

    return NextResponse.json({
      success: true,
      etag: result.etag,
      key,
      size: contentLength,
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error uploading file");
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  } finally {
    await releaseObjectLease(userId, bucketName, key, lease).catch((err) =>
      s3ApiLog.error({ err }, "Failed to release S3 object lease")
    );
  }
}
