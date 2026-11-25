/**
 * Team Quota Service
 * Handles quota operations for team storage
 *
 * IMPORTANT: Team storage is shared from the owner's plan quota.
 * Member limits and storage depend on the owner's plan tier.
 * Team uploads count against the owner's storage usage.
 */

import { db } from "@/lib/shared/db";
import { teams, teamFiles, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  getPlanLimits,
  validateTeamUploadAgainstOwner,
  canCreateTeam,
  getMaxTeamMembers,
  type UploadValidationResult
} from "@/lib/payments/plans";

export interface AtomicQuotaResult {
  success: boolean;
  isNewFile: boolean;
  existingSize: number;
  quotaExceeded?: boolean;
}

export class TeamQuotaService {
  /**
   * Get team by ID
   */
  async getTeam(teamId: string) {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    return team;
  }

  /**
   * Get team owner with their plan and storage info
   */
  async getTeamOwner(teamId: string) {
    const team = await this.getTeam(teamId);
    if (!team) return null;

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, team.ownerId))
      .limit(1);

    return owner;
  }

  /**
   * Get team with owner info for quota checks
   */
  async getTeamWithOwner(teamId: string) {
    const [result] = await db
      .select({
        team: teams,
        owner: users,
      })
      .from(teams)
      .innerJoin(users, eq(teams.ownerId, users.id))
      .where(eq(teams.id, teamId))
      .limit(1);

    return result;
  }

  /**
   * Check if team has enough quota for a file upload
   * Checks against owner's plan storage limit
   */
  async checkTeamQuota(teamId: string, fileSize: number): Promise<boolean> {
    const data = await this.getTeamWithOwner(teamId);
    if (!data) return false;

    const { owner } = data;
    const limits = getPlanLimits(owner.plan);

    // Check file size limit first
    if (fileSize > limits.maxFileSizeBytes) {
      return false;
    }

    // Check storage limit against owner's usage
    return (owner.storageUsage + fileSize) <= limits.maxStorageBytes;
  }

  /**
   * Validate if a team upload is allowed and returns detailed error info
   * Validates against the team owner's plan quota
   */
  async validateTeamUploadAllowed(
    teamId: string,
    fileSize: number,
    isNewFile: boolean
  ): Promise<UploadValidationResult> {
    const data = await this.getTeamWithOwner(teamId);
    if (!data) {
      return {
        allowed: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Team not found",
          details: {
            limit: 0,
            current: 0,
            requested: fileSize,
            limitFormatted: "N/A",
            currentFormatted: "N/A",
            requestedFormatted: String(fileSize),
          },
        },
      };
    }

    const { owner } = data;

    // Validate against owner's plan quota
    return validateTeamUploadAgainstOwner(
      owner.plan,
      owner.storageUsage,
      owner.fileCount,
      fileSize,
      isNewFile
    );
  }

  /**
   * Atomically reserve storage quota for a team file upload
   * Updates BOTH the owner's storage (for quota) AND team's storage (for tracking)
   */
  async reserveQuotaAtomic(
    teamId: string,
    fileKey: string,
    newSize: number
  ): Promise<AtomicQuotaResult> {
    // Get team with owner for quota check
    const data = await this.getTeamWithOwner(teamId);
    if (!data) {
      return { success: false, isNewFile: true, existingSize: 0, quotaExceeded: false };
    }

    const { owner } = data;
    const limits = getPlanLimits(owner.plan);

    // Check for existing file
    const [existingFile] = await db
      .select({ fileSize: teamFiles.fileSize })
      .from(teamFiles)
      .where(
        and(
          eq(teamFiles.teamId, teamId),
          eq(teamFiles.fileKey, fileKey)
        )
      )
      .limit(1);

    const existingSize = existingFile?.fileSize ?? 0;
    const isNewFile = !existingFile;

    // Calculate storage delta
    let storageChange: number;
    let countChange: number;

    if (isNewFile) {
      storageChange = newSize;
      countChange = 1;
    } else if (newSize > existingSize) {
      storageChange = newSize - existingSize;
      countChange = 0;
    } else if (newSize < existingSize) {
      // File is smaller - decrement, which always succeeds
      await this.decrementUsage(teamId, existingSize - newSize, 0);
      return { success: true, isNewFile: false, existingSize };
    } else {
      // Same size - no change needed
      return { success: true, isNewFile: false, existingSize };
    }

    // Atomic update on OWNER's storage with quota check
    const ownerResult = await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${storageChange}`,
        fileCount: sql`${users.fileCount} + ${countChange}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.id} = ${owner.id} AND (${users.storageUsage} + ${storageChange}) <= ${limits.maxStorageBytes}`
      )
      .returning();

    if (ownerResult.length === 0) {
      return {
        success: false,
        isNewFile,
        existingSize,
        quotaExceeded: true,
      };
    }

    // Also update team's storage tracking (for display purposes)
    await db
      .update(teams)
      .set({
        storageUsage: sql`${teams.storageUsage} + ${storageChange}`,
        fileCount: sql`${teams.fileCount} + ${countChange}`,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));

    return { success: true, isNewFile, existingSize };
  }

  /**
   * Increment team usage (updates both team tracking AND owner's quota)
   */
  async incrementUsage(teamId: string, size: number, count: number = 1) {
    const team = await this.getTeam(teamId);
    if (!team) return;

    // Update owner's storage
    await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${size}`,
        fileCount: sql`${users.fileCount} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, team.ownerId));

    // Update team's tracking
    await db
      .update(teams)
      .set({
        storageUsage: sql`${teams.storageUsage} + ${size}`,
        fileCount: sql`${teams.fileCount} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
  }

  /**
   * Decrement team usage (updates both team tracking AND owner's quota)
   */
  async decrementUsage(teamId: string, size: number, count: number = 1) {
    const team = await this.getTeam(teamId);
    if (!team) return;

    // Update owner's storage
    await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${size})`,
        fileCount: sql`GREATEST(0, ${users.fileCount} - ${count})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, team.ownerId));

    // Update team's tracking
    await db
      .update(teams)
      .set({
        storageUsage: sql`GREATEST(0, ${teams.storageUsage} - ${size})`,
        fileCount: sql`GREATEST(0, ${teams.fileCount} - ${count})`,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
  }

  /**
   * Rollback reserved quota (for failed uploads)
   */
  async rollbackQuota(teamId: string, size: number, count: number = 1) {
    await this.decrementUsage(teamId, size, count);
  }

  /**
   * Get team's current usage and limits (based on owner's plan)
   */
  async getTeamLimits(teamId: string): Promise<{
    // Team-specific tracking
    teamStorageUsage: number;
    teamFileCount: number;
    memberCount: number;
    // Owner's plan limits (shared with team)
    ownerStorageUsage: number;
    storageLimit: number;
    maxFileSizeBytes: number;
    maxMembers: number;
    ownerPlan: string;
  } | null> {
    const data = await this.getTeamWithOwner(teamId);
    if (!data) return null;

    const { team, owner } = data;
    const limits = getPlanLimits(owner.plan);

    return {
      // Team-specific tracking
      teamStorageUsage: team.storageUsage,
      teamFileCount: team.fileCount,
      memberCount: team.memberCount,
      // Owner's plan limits
      ownerStorageUsage: owner.storageUsage,
      storageLimit: limits.maxStorageBytes,
      maxFileSizeBytes: limits.maxFileSizeBytes,
      maxMembers: limits.maxTeamMembers + 1, // +1 to include owner
      ownerPlan: owner.plan,
    };
  }

  /**
   * Increment member count (for new member joins)
   */
  async incrementMemberCount(teamId: string) {
    await db
      .update(teams)
      .set({
        memberCount: sql`${teams.memberCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
  }

  /**
   * Atomically increment member count only if under the limit.
   * Returns true if the member was added, false if limit reached.
   */
  async tryIncrementMemberCount(teamId: string): Promise<boolean> {
    const data = await this.getTeamWithOwner(teamId);
    if (!data) return false;

    const { owner } = data;
    const maxMembers = getMaxTeamMembers(owner.plan) + 1; // +1 for owner

    const result = await db
      .update(teams)
      .set({
        memberCount: sql`${teams.memberCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        sql`${teams.id} = ${teamId} AND ${teams.memberCount} < ${maxMembers}`
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Decrement member count (for member removals)
   */
  async decrementMemberCount(teamId: string) {
    await db
      .update(teams)
      .set({
        memberCount: sql`GREATEST(1, ${teams.memberCount} - 1)`, // Never go below 1 (owner)
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
  }

  /**
   * Check if team can add more members (based on owner's plan)
   */
  async canAddMember(teamId: string): Promise<boolean> {
    const data = await this.getTeamWithOwner(teamId);
    if (!data) return false;

    const { team, owner } = data;
    const maxMembers = getMaxTeamMembers(owner.plan);

    // memberCount includes owner, maxTeamMembers is additional members allowed
    // So total allowed = maxTeamMembers + 1 (owner)
    return team.memberCount < (maxMembers + 1);
  }

  /**
   * Check if user can create a team based on their plan
   */
  canUserCreateTeam(plan: string): boolean {
    return canCreateTeam(plan);
  }

  /**
   * Get max members allowed for a user's plan (excluding owner)
   */
  getMaxMembersForPlan(plan: string): number {
    return getMaxTeamMembers(plan);
  }
}

export const teamQuotaService = new TeamQuotaService();
