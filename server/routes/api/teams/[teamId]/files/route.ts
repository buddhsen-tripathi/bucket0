import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { Permission } from "@/lib/teams/permission-service";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamFileService } from "@/lib/teams/team-file-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { formatBytes } from "@/lib/payments/plans";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/files
 * List files for a team (paginated)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    // Check download permission (view files)
    const permError = await requireTeamPermission(teamId, userId, Permission.DOWNLOAD);
    if (permError) return permError;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10), 1),
      100
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10),
      0
    );
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Get team files
    const { files, total } = await teamFileService.listFiles(teamId, {
      limit,
      offset,
      sortBy,
      sortOrder,
    });

    // Get team quota info (includes owner's plan limits)
    const teamLimits = await teamQuotaService.getTeamLimits(teamId);

    // Transform files to expected format
    const transformedFiles = files.map((file) => ({
      key: file.fileKey.replace(`teams/${teamId}/`, ""),
      size: file.fileSize,
      lastModified: file.createdAt,
      hasThumbnail: !!file.thumbnailKey,
      mimeType: file.mimeType,
      isStarred: file.isStarred,
      uploadedBy: file.uploadedBy,
      id: file.id,
    }));

    const storageLimit = teamLimits?.storageLimit ?? 0;
    const ownerStorageUsed = teamLimits?.ownerStorageUsage ?? 0;
    const availableStorage = Math.max(0, storageLimit - ownerStorageUsed);

    return NextResponse.json({
      files: transformedFiles,
      total,
      limit,
      offset,
      hasMore: offset + files.length < total,
      usage: teamLimits?.teamStorageUsage ?? 0,
      usageFormatted: formatBytes(teamLimits?.teamStorageUsage ?? 0),
      fileCount: teamLimits?.teamFileCount ?? 0,
      storageLimit,
      storageLimitFormatted: formatBytes(storageLimit),
      availableStorage,
      availableStorageFormatted: formatBytes(availableStorage),
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error listing files");
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }
}
