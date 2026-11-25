import { deleteGeneratedThumbnails } from "@/lib/cloud/thumbnail-storage";
import { db } from "@/lib/shared/db";
import {
  teams,
  teamMembers,
  teamRoles,
  teamInvitations,
  teamFiles,
  activityLogs,
  teamMessages,
  users,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { systemStorage } from "@/lib/cloud/system-service";
import { teamLog } from "@/lib/shared/logger";

/**
 * Completely delete a team and all of its data: team-scoped DB rows, the
 * team's R2 objects (teams/{teamId}/...), and a rollback of the owner's
 * storage quota for the team's files.
 *
 * Idempotent — if the team no longer exists this is a no-op, and every
 * delete is scoped by teamId so a repeat run affects zero rows.
 */
export async function deleteTeamCompletely(teamId: string): Promise<void> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) return;

  // Delete in order to respect foreign key constraints
  await db.delete(teamMessages).where(eq(teamMessages.teamId, teamId));
  await db.delete(activityLogs).where(eq(activityLogs.teamId, teamId));
  await db.delete(teamInvitations).where(eq(teamInvitations.teamId, teamId));
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.delete(teamRoles).where(eq(teamRoles.teamId, teamId));

  // Roll back the owner's storage quota for all team files
  const [teamFileStats] = await db
    .select({
      totalSize: sql<number>`COALESCE(SUM(${teamFiles.fileSize}), 0)`,
      totalCount: sql<number>`COUNT(*)`,
    })
    .from(teamFiles)
    .where(eq(teamFiles.teamId, teamId));

  if (teamFileStats.totalSize > 0) {
    await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${teamFileStats.totalSize})`,
        fileCount: sql`GREATEST(0, ${users.fileCount} - ${teamFileStats.totalCount})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, team.ownerId));
  }

  // Delete all team files from R2 storage
  try {
    await systemStorage.deleteAllTeamFiles(teamId);
  } catch (storageError) {
    teamLog.error({ err: storageError }, "Error deleting team files from R2");
    // Continue with deletion even if R2 cleanup fails
  }

  await db.delete(teamFiles).where(eq(teamFiles.teamId, teamId));
  await deleteGeneratedThumbnails("team", teamId);
  await db.delete(teams).where(eq(teams.id, teamId));
}
