/**
 * Activity Service
 * Handles logging and querying of team activity
 */

import { db } from "@/lib/shared/db";
import { activityLogs } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export type ActivityAction =
  | "file.upload"
  | "file.download"
  | "file.delete"
  | "file.share"
  | "file.unshare"
  | "member.join"
  | "member.leave"
  | "member.invite"
  | "member.invite_resend"
  | "member.invite_cancel"
  | "member.remove"
  | "member.permission_change"
  | "role.create"
  | "role.update"
  | "role.delete"
  | "role.assign"
  | "team.create"
  | "team.update"
  | "team.settings_change"
  | "team.transfer_ownership";

export type ResourceType =
  | "file"
  | "member"
  | "invitation"
  | "role"
  | "team"
  | "share_link";

export interface LogActivityParams {
  teamId: string;
  userId: string;
  action: ActivityAction;
  resourceType: ResourceType;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ActivityLogEntry {
  id: string;
  teamId: string | null;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export class ActivityService {
  /**
   * Log an activity event
   */
  async logActivity(params: LogActivityParams): Promise<void> {
    await db.insert(activityLogs).values({
      teamId: params.teamId,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      description: params.description,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /**
   * Get paginated activity feed for a team
   */
  async getTeamActivity(
    teamId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: ActivityAction;
      resourceType?: ResourceType;
    } = {}
  ): Promise<ActivityLogEntry[]> {
    const { limit = 50, offset = 0, action, resourceType } = options;

    const conditions = [eq(activityLogs.teamId, teamId)];

    if (action) {
      conditions.push(eq(activityLogs.action, action));
    }

    if (resourceType) {
      conditions.push(eq(activityLogs.resourceType, resourceType));
    }

    const activities = await db
      .select()
      .from(activityLogs)
      .where(and(...conditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return activities.map((a) => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));
  }

  /**
   * Get activity for a specific resource (e.g., file)
   */
  async getResourceActivity(
    teamId: string,
    resourceId: string,
    limit: number = 20
  ): Promise<ActivityLogEntry[]> {
    const activities = await db
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.teamId, teamId),
          eq(activityLogs.resourceId, resourceId)
        )
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return activities.map((a) => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));
  }

  /**
   * Get activity for a specific user in a team
   */
  async getUserActivity(
    teamId: string,
    userId: string,
    limit: number = 50
  ): Promise<ActivityLogEntry[]> {
    const activities = await db
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.teamId, teamId),
          eq(activityLogs.userId, userId)
        )
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return activities.map((a) => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));
  }

  /**
   * Get recent activity (last N seconds) for real-time updates
   */
  async getRecentActivity(
    teamId: string,
    sinceSeconds: number = 10
  ): Promise<ActivityLogEntry[]> {
    const since = new Date(Date.now() - sinceSeconds * 1000);

    const activities = await db
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.teamId, teamId),
          sql`${activityLogs.createdAt} > ${since}`
        )
      )
      .orderBy(desc(activityLogs.createdAt));

    return activities.map((a) => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));
  }

  /**
   * Get activity count for a team
   */
  async getActivityCount(teamId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityLogs)
      .where(eq(activityLogs.teamId, teamId));

    return result[0]?.count ?? 0;
  }

  /**
   * Delete old activity logs (retention cleanup)
   */
  async cleanupOldActivity(teamId: string, retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db
      .delete(activityLogs)
      .where(
        and(
          eq(activityLogs.teamId, teamId),
          sql`${activityLogs.createdAt} < ${cutoffDate}`
        )
      )
      .returning();

    return result.length;
  }
}

export const activityService = new ActivityService();

// Helper functions for common activity logging patterns

export async function logFileUpload(
  teamId: string,
  userId: string,
  fileName: string,
  fileSize: number,
  fileId?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "file.upload",
    resourceType: "file",
    resourceId: fileId,
    description: `Uploaded ${fileName}`,
    metadata: { fileName, fileSize },
  });
}

export async function logBatchUpload(
  teamId: string,
  userId: string,
  fileNames: string[],
  totalSize: number
) {
  // Detect if this is a folder upload by finding common prefix
  const folderPrefix = findCommonFolderPrefix(fileNames);

  let description: string;
  if (folderPrefix && fileNames.length > 1) {
    // Folder upload - show folder name with file count
    description = `Uploaded ${folderPrefix} (${fileNames.length} files)`;
  } else if (fileNames.length === 1) {
    // Single file
    description = `Uploaded ${fileNames[0]}`;
  } else {
    // Multiple files without common folder
    description = `Uploaded ${fileNames.length} files`;
  }

  await activityService.logActivity({
    teamId,
    userId,
    action: "file.upload",
    resourceType: "file",
    description,
    metadata: {
      fileCount: fileNames.length,
      totalSize,
      folderPrefix: folderPrefix || null,
      files: fileNames.slice(0, 10), // Store first 10 file names for reference
    },
  });
}

// Find common folder prefix from file paths
function findCommonFolderPrefix(fileNames: string[]): string | null {
  if (fileNames.length === 0) return null;
  if (fileNames.length === 1) {
    // Single file - check if it has a folder
    const parts = fileNames[0].split("/");
    if (parts.length > 1) {
      return parts[0] + "/";
    }
    return null;
  }

  // Find first folder that's common to all files
  const firstParts = fileNames[0].split("/");
  if (firstParts.length <= 1) return null;

  const commonFolder = firstParts[0];
  const allHavePrefix = fileNames.every((name) => name.startsWith(commonFolder + "/"));

  return allHavePrefix ? commonFolder + "/" : null;
}

export async function logFileDownload(
  teamId: string,
  userId: string,
  fileName: string,
  fileId?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "file.download",
    resourceType: "file",
    resourceId: fileId,
    description: `Downloaded ${fileName}`,
    metadata: { fileName },
  });
}

export async function logFileDelete(
  teamId: string,
  userId: string,
  fileName: string,
  fileId?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "file.delete",
    resourceType: "file",
    resourceId: fileId,
    description: `Deleted ${fileName}`,
    metadata: { fileName },
  });
}

export async function logMemberJoin(
  teamId: string,
  userId: string,
  memberEmail: string,
  invitedBy?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "member.join",
    resourceType: "member",
    resourceId: userId,
    description: `${memberEmail} joined the team`,
    metadata: { memberEmail, invitedBy },
  });
}

export async function logMemberRemove(
  teamId: string,
  actorUserId: string,
  removedUserId: string,
  removedEmail: string
) {
  await activityService.logActivity({
    teamId,
    userId: actorUserId,
    action: "member.remove",
    resourceType: "member",
    resourceId: removedUserId,
    description: `Removed ${removedEmail} from the team`,
    metadata: { removedEmail, removedUserId },
  });
}

export async function logFileShare(
  teamId: string,
  userId: string,
  fileName: string,
  accessType: "anyone" | "protected",
  shareUrl: string,
  fileId?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "file.share",
    resourceType: "share_link",
    resourceId: fileId,
    description: `Shared ${fileName} (${accessType === "anyone" ? "public" : "protected"})`,
    metadata: { fileName, accessType, shareUrl },
  });
}

export async function logFileUnshare(
  teamId: string,
  userId: string,
  fileName: string,
  fileId?: string
) {
  await activityService.logActivity({
    teamId,
    userId,
    action: "file.unshare",
    resourceType: "share_link",
    resourceId: fileId,
    description: `Revoked share link for ${fileName}`,
    metadata: { fileName },
  });
}
