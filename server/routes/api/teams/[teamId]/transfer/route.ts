import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teams, teamMembers, teamFiles, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { activityService } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamOwner } from "@/lib/teams/route-helpers";
import { canCreateTeam, getPlanLimits } from "@/lib/payments/plans";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * POST /api/teams/[teamId]/transfer
 * Transfer team ownership to another member (owner only)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    const body = await request.json();
    const { newOwnerId } = body;

    if (!newOwnerId || typeof newOwnerId !== "string") {
      return NextResponse.json(
        { error: "New owner ID is required" },
        { status: 400 }
      );
    }

    if (newOwnerId === userId) {
      return NextResponse.json(
        { error: "Cannot transfer ownership to yourself" },
        { status: 400 }
      );
    }

    // Verify new owner is a team member
    const [newOwnerMember] = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newOwnerId))
      )
      .limit(1);

    if (!newOwnerMember) {
      return NextResponse.json(
        { error: "User is not a member of this team" },
        { status: 400 }
      );
    }

    // Validate new owner's plan can support team ownership
    const [newOwnerUser] = await db
      .select({ plan: users.plan, storageUsage: users.storageUsage, fileCount: users.fileCount })
      .from(users)
      .where(eq(users.id, newOwnerId))
      .limit(1);

    if (!newOwnerUser || !canCreateTeam(newOwnerUser.plan)) {
      return NextResponse.json(
        { error: "New owner's plan does not support team ownership. They need a Starter or higher plan." },
        { status: 400 }
      );
    }

    // Calculate team's total storage from teamFiles
    const [teamFileStats] = await db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${teamFiles.fileSize}), 0)`,
        totalCount: sql<number>`COUNT(*)`,
      })
      .from(teamFiles)
      .where(eq(teamFiles.teamId, teamId));

    const teamStorageSize = teamFileStats.totalSize;
    const teamFileCount = teamFileStats.totalCount;

    // Check if new owner has enough quota for team files
    const newOwnerLimits = getPlanLimits(newOwnerUser.plan);
    if (newOwnerUser.storageUsage + teamStorageSize > newOwnerLimits.maxStorageBytes) {
      return NextResponse.json(
        { error: "New owner does not have enough storage quota for this team's files." },
        { status: 400 }
      );
    }

    // Get current owner's member record
    const [currentOwnerMember] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    // Transfer storage accounting: old owner → new owner
    if (teamStorageSize > 0) {
      // Decrement old owner's usage
      await db
        .update(users)
        .set({
          storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${teamStorageSize})`,
          fileCount: sql`GREATEST(0, ${users.fileCount} - ${teamFileCount})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Increment new owner's usage
      await db
        .update(users)
        .set({
          storageUsage: sql`${users.storageUsage} + ${teamStorageSize}`,
          fileCount: sql`${users.fileCount} + ${teamFileCount}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, newOwnerId));
    }

    // 1. Update team owner
    await db
      .update(teams)
      .set({
        ownerId: newOwnerId,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));

    // 2. Update new owner's member record to have full permissions
    await db
      .update(teamMembers)
      .set({
        canManageMembers: true,
        canUpload: true,
        canDownload: true,
        canDelete: true,
        canShare: true,
        canViewActivity: true,
        canChat: true,
      })
      .where(eq(teamMembers.id, newOwnerMember.id));

    // 3. Previous owner becomes admin-level member
    if (currentOwnerMember) {
      await db
        .update(teamMembers)
        .set({
          canManageMembers: true,
          canUpload: true,
          canDownload: true,
          canDelete: true,
          canShare: true,
          canViewActivity: true,
          canChat: true,
        })
        .where(eq(teamMembers.id, currentOwnerMember.id));
    } else {
      // Owner had no teamMembers record — create one so they retain access
      await db.insert(teamMembers).values({
        teamId,
        userId,
        canManageMembers: true,
        canUpload: true,
        canDownload: true,
        canDelete: true,
        canShare: true,
        canViewActivity: true,
        canChat: true,
        invitedBy: newOwnerId,
      });
    }

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "team.transfer_ownership",
      resourceType: "team",
      resourceId: teamId,
      description: `Transferred team ownership to another member`,
      metadata: { previousOwnerId: userId, newOwnerId },
    });

    teamLog.info("Team ownership transferred");

    return NextResponse.json({
      success: true,
      message: "Team ownership has been transferred",
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error transferring ownership");
    return NextResponse.json(
      { error: "Failed to transfer ownership" },
      { status: 500 }
    );
  }
}
