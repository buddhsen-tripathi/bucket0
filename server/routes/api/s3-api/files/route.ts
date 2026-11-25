/**
 * S3 API Files - Web UI endpoints for file operations
 * Uses Clerk session auth (not AWS Sig v4)
 *
 * GET /api/s3-api/files?bucket=xxx - List files
 * DELETE /api/s3-api/files?bucket=xxx&key=xxx - Delete file
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { s3ApiBucketService, s3ApiStorageService, s3ApiQuotaService, acquireObjectLease, releaseObjectLease } from "@/lib/s3-api";
import { formatBytes } from "@/lib/payments/plans";
import { s3ApiLog } from "@/lib/shared/logger";

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = request.nextUrl.searchParams.get("bucket");
  const prefix = request.nextUrl.searchParams.get("prefix") || "";

  if (!bucketName) {
    return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
  }

  // Verify bucket exists and belongs to user
  const bucket = await s3ApiBucketService.getBucket(userId, bucketName);
  if (!bucket) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  try {
    const result = await s3ApiStorageService.listObjects(userId, bucketName, {
      prefix: prefix || undefined,
      delimiter: "/",
      maxKeys: 1000,
    });

    // Format files for UI
    const files = result.objects.map((obj) => ({
      key: obj.key,
      name: obj.key.split("/").pop() || obj.key,
      size: obj.size,
      sizeFormatted: formatBytes(obj.size),
      lastModified: obj.lastModified.toISOString(),
      etag: obj.etag,
      isFolder: false,
    }));

    // Add folders from common prefixes
    const folders = result.prefixes.map((p) => ({
      key: p,
      name: p.replace(prefix, "").replace(/\/$/, ""),
      size: 0,
      sizeFormatted: "-",
      lastModified: "",
      etag: "",
      isFolder: true,
    }));

    return NextResponse.json({
      files: [...folders, ...files],
      prefix,
      bucketName,
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error listing files");
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

  // Serialize writes/deletes per object so the size read and quota change happen once
  const lease = await acquireObjectLease(userId, bucketName, key);
  if (!lease) {
    return NextResponse.json({ error: "Another change to this file is in progress. Try again." }, { status: 409 });
  }

  try {
    // Get object size before deleting
    const existingSize = await s3ApiStorageService.getObjectSize(userId, bucketName, key);

    if (existingSize === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete from R2
    if (!await s3ApiStorageService.deleteObject(userId, bucketName, key)) {
      return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
    }

    // Release quota
    await s3ApiQuotaService.releaseQuota(userId, existingSize);

    // Update bucket stats
    await s3ApiQuotaService.updateBucketStats(userId, bucketName, -existingSize, -1);

    return NextResponse.json({ success: true });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error deleting file");
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  } finally {
    await releaseObjectLease(userId, bucketName, key, lease).catch((err) =>
      s3ApiLog.error({ err }, "Failed to release S3 object lease")
    );
  }
}
