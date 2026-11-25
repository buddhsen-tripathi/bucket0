/**
 * S3 API Bucket Management
 *
 * POST /api/s3-api/bucket - Create a new bucket
 * GET /api/s3-api/bucket - List buckets or get bucket info
 * DELETE /api/s3-api/bucket?name=xxx - Delete a bucket
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { s3ApiBucketService, s3ApiStorageService } from "@/lib/s3-api";
import { formatBytes } from "@/lib/payments/plans";
import { s3ApiLog } from "@/lib/shared/logger";

/**
 * POST - Create a new S3 API bucket
 *
 * Body: { name: string }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const bucketName = body.name;

    if (!bucketName) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }

    const result = await s3ApiBucketService.createBucket(userId, bucketName);

    if (!result.success) {
      const status =
        result.error?.code === "INVALID_NAME" ? 400 :
        result.error?.code === "ALREADY_EXISTS" ? 409 :
        result.error?.code === "USER_NOT_FOUND" ? 404 :
        result.error?.code === "BUCKET_LIMIT_EXCEEDED" ? 403 : 403;

      return NextResponse.json(
        {
          error: result.error?.message,
          code: result.error?.code,
        },
        { status }
      );
    }

    s3ApiLog.info("Bucket created");
    return NextResponse.json({
      bucket: {
        id: result.bucket!.id,
        name: result.bucket!.bucketName,
        storageUsed: result.bucket!.storageUsed,
        storageUsedFormatted: formatBytes(result.bucket!.storageUsed),
        objectCount: result.bucket!.objectCount,
        createdAt: result.bucket!.createdAt.toISOString(),
      },
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error creating bucket");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET - List buckets or get bucket info
 *
 * Query: ?name=xxx (optional, returns single bucket info)
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = request.nextUrl.searchParams.get("name");

  try {
    if (bucketName) {
      // Get single bucket info with fresh stats from R2
      const bucket = await s3ApiBucketService.getBucket(userId, bucketName);

      if (!bucket) {
        return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
      }

      // Get actual storage stats from R2
      const stats = await s3ApiStorageService.calculateBucketStorageUsed(userId, bucketName);

      return NextResponse.json({
        bucket: {
          id: bucket.id,
          name: bucket.bucketName,
          storageUsed: stats.storageUsed,
          storageUsedFormatted: formatBytes(stats.storageUsed),
          objectCount: stats.objectCount,
          isActive: bucket.isActive,
          createdAt: bucket.createdAt.toISOString(),
          updatedAt: bucket.updatedAt.toISOString(),
        },
      });
    }

    // List all buckets
    const buckets = await s3ApiBucketService.listBuckets(userId);

    return NextResponse.json({
      buckets: buckets.map(bucket => ({
        id: bucket.id,
        name: bucket.bucketName,
        storageUsed: bucket.storageUsed,
        storageUsedFormatted: formatBytes(bucket.storageUsed),
        objectCount: bucket.objectCount,
        isActive: bucket.isActive,
        createdAt: bucket.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error getting bucket info");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE - Delete a bucket
 *
 * Query: ?name=xxx&force=true (force deletes all objects first)
 */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = request.nextUrl.searchParams.get("name");
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (!bucketName) {
    return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
  }

  try {
    const result = await s3ApiBucketService.deleteBucket(userId, bucketName, force);

    if (!result.success) {
      const status = result.error === "Bucket not found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }

    s3ApiLog.info("Bucket deleted");
    return NextResponse.json({
      success: true,
      deletedObjects: result.deletedObjects,
      freedBytes: result.freedBytes,
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error deleting bucket");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
