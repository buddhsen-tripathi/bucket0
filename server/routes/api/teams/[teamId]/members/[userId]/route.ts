import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { permissionService, Permission } from "@/lib/teams/permission-service";
import { activityService, logMemberRemove } from "@/lib/teams/activity-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { clerkClient } from "@/server/compat/clerk";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string; userId: string }>;
}

/**
 * PATCH /api/teams/[teamId]/members/[userId]
 * Update member permissions
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const currentUserId = authResult.userId;

    const { teamId, userId: targetUserId } = await params;

    // Check manage members permission (parallelized with owner check)
    const permError = await requireTeamPermission(teamId, currentUserId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    const isOwner = await permissionService.isTeamOwner(teamId, currentUserId);

    // Can't modify owner
    const targetIsOwner = await permissionService.isTeamOwner(teamId, targetUserId);
    if (targetIsOwner) {
      return NextResponse.json(
        { error: "Cannot modify owner permissions" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      roleId,
      canUpload,
      canDownload,
      canDelete,
      canShare,
      canManageMembers,
      canViewActivity,
      canChat,
    } = body;

    // Build update object
    const updates: Partial<typeof teamMembers.$inferInsert> = {};

    if (roleId !== undefined) {
      updates.roleId = roleId;
    }
    if (canUpload !== undefined) {
      updates.canUpload = canUpload;
    }
    if (canDownload !== undefined) {
      updates.canDownload = canDownload;
    }
    if (canDelete !== undefined) {
      updates.canDelete = canDelete;
    }
    if (canShare !== undefined) {
      updates.canShare = canShare;
    }
    if (canManageMembers !== undefined) {
      // Only owner can grant manage_members permission
      if (!isOwner) {
        return NextResponse.json(
          { error: "Only owner can grant member management permission" },
          { status: 403 }
        );
      }
      updates.canManageMembers = canManageMembers;
    }
    if (canViewActivity !== undefined) {
      updates.canViewActivity = canViewActivity;
    }
    if (canChat !== undefined) {
      updates.canChat = canChat;
    }

    const [updatedMember] = await db
      .update(teamMembers)
      .set(updates)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, targetUserId)
        )
      )
      .returning();

    if (!updatedMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Log activity
    await activityService.logActivity({
      teamId,
      userId: currentUserId,
      action: "member.permission_change",
      resourceType: "member",
      resourceId: targetUserId,
      description: `Updated permissions for member`,
      metadata: { targetUserId, updates: Object.keys(updates) },
    });

    teamLog.info("Member permissions updated");

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    teamLog.error({ err: error }, "Error updating member");
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/members/[userId]
 * Remove a member from the team
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const currentUserId = authResult.userId;

    const { teamId, userId: targetUserId } = await params;

    // Check if target is owner (can't remove owner)
    const targetIsOwner = await permissionService.isTeamOwner(teamId, targetUserId);
    if (targetIsOwner) {
      return NextResponse.json(
        { error: "Cannot remove team owner" },
        { status: 400 }
      );
    }

    // User can remove themselves, or needs manage_members permission
    const isSelf = currentUserId === targetUserId;
    const hasPermission = await permissionService.hasPermission(
      teamId,
      currentUserId,
      Permission.MANAGE_MEMBERS
    );
    const isOwner = await permissionService.isTeamOwner(teamId, currentUserId);

    if (!isSelf && !hasPermission && !isOwner) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Get member info before deletion for logging
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Get user email for logging
    let targetEmail = targetUserId;
    try {
      const client = await clerkClient();
      const targetUser = await client.users.getUser(targetUserId);
      targetEmail = targetUser.emailAddresses[0]?.emailAddress || targetUserId;
    } catch {
      // Ignore - use userId if can't get email
    }

    // Delete member
    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, targetUserId)
        )
      );

    // Decrement member count
    await teamQuotaService.decrementMemberCount(teamId);

    // Log activity
    if (isSelf) {
      await activityService.logActivity({
        teamId,
        userId: currentUserId,
        action: "member.leave",
        resourceType: "member",
        resourceId: targetUserId,
        description: `${targetEmail} left the team`,
        metadata: { memberEmail: targetEmail },
      });
    } else {
      await logMemberRemove(teamId, currentUserId, targetUserId, targetEmail);
    }

    teamLog.info("Member removed");

    return NextResponse.json({
      success: true,
      message: isSelf ? "You have left the team" : `Member removed from team`,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error removing member");
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
