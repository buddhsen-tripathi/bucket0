import { runInBackground } from "@/server/context";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { systemStorage } from "@/lib/cloud/system-service";
import { Permission } from "@/lib/teams/permission-service";
import { permissionService } from "@/lib/teams/permission-service";
import { requireAuth } from "@/lib/teams/route-helpers";
import { teamFileService } from "@/lib/teams/team-file-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { logFileDelete } from "@/lib/teams/activity-service";
import { teamLog } from "@/lib/shared/logger";
import { db } from "@/lib/shared/db";
import { teamShareLinks } from "@/db/schema";
import { eq, and, like } from "drizzle-orm";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Check delete permission
    const [hasPermission, isOwner, isMember] = await Promise.all([
      permissionService.hasPermission(teamId, userId, Permission.DELETE),
      permissionService.isTeamOwner(teamId, userId),
      permissionService.isTeamMember(teamId, userId),
    ]);

    if (!isMember) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // For delete, also allow a current member to delete their own uploads
    const fullKey = `teams/${teamId}/${key}`;
    const fileRecord = await teamFileService.getFile(teamId, fullKey);

    const isUploader = fileRecord?.uploadedBy === userId;

    if (!hasPermission && !isOwner && !isUploader) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    let size = 0;
    let count = 1;

    // Check if it's a folder (ends with slash)
    if (key.endsWith("/")) {
      // Delete folder: get sizes, delete from R2, delete DB records
      const { totalSize, count: fileCount } = await teamFileService.deleteFilesByPrefix(teamId, fullKey);
      size = totalSize;
      count = fileCount;

      await systemStorage.deleteTeamFolder(teamId, key);

      // Revoke share links for deleted files
      await db
        .update(teamShareLinks)
        .set({ isActive: false })
        .where(and(eq(teamShareLinks.teamId, teamId), like(teamShareLinks.fileKey, `${escapeLikePattern(key)}%`)));
    } else {
      // Single file delete
      size = fileRecord?.fileSize ?? await systemStorage.getTeamFileSize(teamId, key);

      // Delete from R2
      await systemStorage.deleteTeamFile(teamId, key);

      // Revoke share links for this file
      await db
        .update(teamShareLinks)
        .set({ isActive: false })
        .where(and(eq(teamShareLinks.teamId, teamId), eq(teamShareLinks.fileKey, key)));

      // Delete the DB record
      await teamFileService.deleteFile(teamId, fullKey);
    }

    // Decrement both team and owner usage
    if (size > 0) {
      await teamQuotaService.decrementUsage(teamId, size, count);
    }

    // Log activity (non-blocking)
    const fileName = key.endsWith("/") ? key : key.split("/").pop() || key;
    await runInBackground(logFileDelete(teamId, userId, fileName, fullKey).catch((err) => {
      teamLog.error({ err }, "Failed to log delete activity");
    }));

    teamLog.info("Team file deleted");

    return NextResponse.json({ success: true });
  } catch (error) {
    teamLog.error({ err: error }, "Error deleting file");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete file" },
      { status: 500 }
    );
  }
}
