import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teamRoles, teamMembers, teams } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { permissionService, Permission } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string; roleId: string }>;
}

/**
 * POST /api/teams/[teamId]/roles/[roleId]/assign
 * Bulk assign a role to multiple members
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { teamId, roleId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user can manage members
    const hasPermission = await permissionService.hasPermission(
      teamId,
      userId,
      Permission.MANAGE_MEMBERS
    );
    const isOwner = await permissionService.isTeamOwner(teamId, userId);

    if (!hasPermission && !isOwner) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    // Verify role exists and belongs to this team
    const [role] = await db
      .select()
      .from(teamRoles)
      .where(and(eq(teamRoles.id, roleId), eq(teamRoles.teamId, teamId)))
      .limit(1);

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // Get team to check for owner
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Filter out owner (can't assign role to owner)
    const validUserIds = userIds.filter((uid: string) => uid !== team.ownerId);

    if (validUserIds.length === 0) {
      return NextResponse.json(
        { error: "Cannot assign role to team owner" },
        { status: 400 }
      );
    }

    // Check if role has manage_members permission (only owner can assign such roles)
    if (role.canManageMembers && !isOwner) {
      return NextResponse.json(
        { error: "Only owner can assign roles with member management permission" },
        { status: 403 }
      );
    }

    // Update members with the role
    const updatedMembers = await db
      .update(teamMembers)
      .set({
        roleId: roleId,
        // Also copy role permissions to member
        canUpload: role.canUpload,
        canDownload: role.canDownload,
        canDelete: role.canDelete,
        canShare: role.canShare,
        canManageMembers: role.canManageMembers,
        canViewActivity: role.canViewActivity,
        canChat: role.canChat,
      })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          inArray(teamMembers.userId, validUserIds)
        )
      )
      .returning();

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "role.assign",
      resourceType: "role",
      resourceId: roleId,
      description: `Assigned role "${role.name}" to ${updatedMembers.length} member(s)`,
      metadata: {
        roleName: role.name,
        assignedTo: validUserIds,
        count: updatedMembers.length,
      },
    });

    teamLog.info("Role assigned");

    return NextResponse.json({
      success: true,
      message: `Role "${role.name}" assigned to ${updatedMembers.length} member(s)`,
      updatedCount: updatedMembers.length,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error assigning role");
    return NextResponse.json(
      { error: "Failed to assign role" },
      { status: 500 }
    );
  }
}
