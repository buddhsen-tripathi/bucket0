import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { chunkedUploadTracker, DEFAULT_STALE_THRESHOLD_MS } from "@/lib/cloud/chunked-upload-tracker";
import { cloudLog } from "@/lib/shared/logger";


/**
 * POST /api/cloud/upload/chunked/cleanup
 * Cleanup abandoned chunked uploads
 *
 * This endpoint can be called:
 * - Manually by admins for maintenance
 * - Via cron job for automated cleanup
 * - By individual users to cleanup their own stale uploads
 *
 * Request body (optional):
 * - thresholdMinutes: number (default: 60) - uploads older than this are considered abandoned
 *
 * Response:
 * - cleaned: number (uploads cleaned up)
 * - failed: number (cleanup failures)
 * - total: number (total stale uploads found)
 * - stats: object (current tracker stats)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse optional threshold from request body
    let thresholdMs = DEFAULT_STALE_THRESHOLD_MS;
    try {
      const body = await request.json();
      if (body.thresholdMinutes && typeof body.thresholdMinutes === "number") {
        // Minimum 15 minutes to prevent accidental cleanup of active uploads
        const minutes = Math.max(15, body.thresholdMinutes);
        thresholdMs = minutes * 60 * 1000;
      }
    } catch {
      // No body or invalid JSON - use default threshold
    }

    // Perform cleanup
    const result = await chunkedUploadTracker.cleanupStaleUploads(userId, thresholdMs);

    // Get current stats
    const stats = await chunkedUploadTracker.getStats(userId);

    cloudLog.info({ cleaned: result.cleaned, failed: result.failed, total: result.total }, "Stale uploads cleaned up");
    return NextResponse.json({
      ...result,
      stats: {
        activeUploads: stats.activeCount,
        totalReservedBytes: stats.totalReservedBytes,
        oldestUploadAgeMinutes: stats.oldestUploadAge
          ? Math.round(stats.oldestUploadAge / 1000 / 60)
          : null,
      },
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Chunked cleanup error");
    return NextResponse.json(
      { error: "Failed to cleanup uploads" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cloud/upload/chunked/cleanup
 * Get stats about active chunked uploads
 *
 * Response:
 * - activeUploads: number
 * - totalReservedBytes: number
 * - oldestUploadAgeMinutes: number | null
 * - staleCount: number (uploads older than 1 hour)
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await chunkedUploadTracker.getStats(userId);
    const staleUploads = await chunkedUploadTracker.getStaleUploads(userId);

    return NextResponse.json({
      activeUploads: stats.activeCount,
      totalReservedBytes: stats.totalReservedBytes,
      oldestUploadAgeMinutes: stats.oldestUploadAge
        ? Math.round(stats.oldestUploadAge / 1000 / 60)
        : null,
      staleCount: staleUploads.length,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Chunked cleanup stats error");
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
