import { deleteGeneratedThumbnails } from "@/lib/cloud/thumbnail-storage";
import { db } from "@/lib/shared/db";
import {
  users,
  cloudFiles,
  shareLinks,
  s3Configurations,
  subscriptions,
  s3ApiCredentials,
  s3ApiBuckets,
  agentApiKeys,
  teams,
  teamMembers,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { systemStorage } from "@/lib/cloud/system-service";
import { s3ApiStorageService } from "@/lib/s3-api/storage-service";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { deleteTeamCompletely } from "@/lib/teams/team-deletion-service";
import { userLog } from "@/lib/shared/logger";

/**
 * Permanently delete a user and ALL associated data (GDPR compliance).
 *
 * This is the single source of truth for account deletion and is called from
 * both the synchronous DELETE /api/user request and the Clerk `user.deleted`
 * webhook, so that every deletion entry point (web profile -> Clerk portal,
 * the public /account-deletion page, and mobile) converges on identical
 * behaviour.
 *
 * It is idempotent: every delete is scoped by userId, so running it again for
 * an already-deleted user (e.g. the request followed by the webhook) affects
 * zero rows. R2 listings simply come back empty on the second pass.
 *
 * Teams owned by the user are deleted entirely (other members lose access).
 * Memory chunks cascade-delete with their cloudFiles rows at the database
 * level. Support records (feedback, contact messages) are intentionally
 * retained.
 */
export async function purgeUserData(userId: string): Promise<void> {
  // 1. Teams owned by the user: delete the team and all of its data.
  const ownedTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.ownerId, userId));

  for (const team of ownedTeams) {
    await deleteTeamCompletely(team.id);
  }

  // 2. Memberships in teams owned by others: remove and fix member counts.
  //    (Owned-team memberships were already removed in step 1.)
  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));

  for (const membership of memberships) {
    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, membership.teamId),
          eq(teamMembers.userId, userId)
        )
      );
    await teamQuotaService.decrementMemberCount(membership.teamId);
  }

  // 3. Personal files in R2 (users/{userId}/...).
  try {
    await systemStorage.deleteAllUserFiles(userId);
  } catch (storageError) {
    userLog.error({ err: storageError }, "Error deleting user files from R2");
    // Continue with deletion even if R2 cleanup fails
  }

  // 3b. S3 API objects in R2 (s3/{userId}/{bucket}/...), before their bucket rows go.
  // On failure the bucket rows are kept so a later purge run can finish the cleanup.
  let s3ApiObjectsDeleted = false;
  try {
    const apiBuckets = await db
      .select({ bucketName: s3ApiBuckets.bucketName })
      .from(s3ApiBuckets)
      .where(eq(s3ApiBuckets.userId, userId));
    for (const bucket of apiBuckets) {
      await s3ApiStorageService.deleteAllObjects(userId, bucket.bucketName);
    }
    s3ApiObjectsDeleted = true;
  } catch (storageError) {
    userLog.error({ err: storageError }, "Error deleting S3 API objects from R2");
  }

  // 4. Personal database records.
  await db.delete(shareLinks).where(eq(shareLinks.userId, userId));
  await db.delete(cloudFiles).where(eq(cloudFiles.userId, userId)); // memoryChunks cascade
  await deleteGeneratedThumbnails("personal", userId);
  await cloudCatalog.removeAllForUser(userId);
  await db.delete(s3Configurations).where(eq(s3Configurations.userId, userId));
  await db.delete(s3ApiCredentials).where(eq(s3ApiCredentials.userId, userId));
  if (s3ApiObjectsDeleted) {
    await db.delete(s3ApiBuckets).where(eq(s3ApiBuckets.userId, userId));
  }
  await db.delete(agentApiKeys).where(eq(agentApiKeys.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));

  // 5. Finally, the user record itself.
  await db.delete(users).where(eq(users.id, userId));

  userLog.info("User data purged");
}
