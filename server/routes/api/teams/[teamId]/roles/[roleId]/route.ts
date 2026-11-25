import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teamRoles, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { activityService } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamOwner } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string; roleId: string }>;
}

/**
 * PATCH /api/teams/[teamId]/roles/[roleId]
 * Update a custom role (owner only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId, roleId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    const body = await request.json();
    const {
      name,
      description,
      canUpload,
      canDownload,
      canDelete,
      canShare,
      canManageMembers,
      canViewActivity,
      canChat,
    } = body;

    const updates: Partial<typeof teamRoles.$inferInsert> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return NextResponse.json(
          { error: "Role name must be at least 2 characters" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description?.trim();
    }
    if (canUpload !== undefined) updates.canUpload = canUpload;
    if (canDownload !== undefined) updates.canDownload = canDownload;
    if (canDelete !== undefined) updates.canDelete = canDelete;
    if (canShare !== undefined) updates.canShare = canShare;
    if (canManageMembers !== undefined) updates.canManageMembers = canManageMembers;
    if (canViewActivity !== undefined) updates.canViewActivity = canViewActivity;
    if (canChat !== undefined) updates.canChat = canChat;

    const [updatedRole] = await db
      .update(teamRoles)
      .set(updates)
      .where(and(eq(teamRoles.id, roleId), eq(teamRoles.teamId, teamId)))
      .returning();

    if (!updatedRole) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "role.update",
      resourceType: "role",
      resourceId: roleId,
      description: `Updated role "${updatedRole.name}"`,
      metadata: { roleName: updatedRole.name, updates: Object.keys(updates) },
    });

    teamLog.info("Role updated");

    return NextResponse.json({ role: updatedRole });
  } catch (error) {
    teamLog.error({ err: error }, "Error updating role");
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/roles/[roleId]
 * Delete a custom role (owner only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId, roleId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    // Get role for logging
    const [role] = await db
      .select()
      .from(teamRoles)
      .where(and(eq(teamRoles.id, roleId), eq(teamRoles.teamId, teamId)))
      .limit(1);

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // Remove role from members (set to null)
    await db
      .update(teamMembers)
      .set({ roleId: null })
      .where(eq(teamMembers.roleId, roleId));

    // Delete role
    await db
      .delete(teamRoles)
      .where(and(eq(teamRoles.id, roleId), eq(teamRoles.teamId, teamId)));

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "role.delete",
      resourceType: "role",
      resourceId: roleId,
      description: `Deleted role "${role.name}"`,
      metadata: { roleName: role.name },
    });

    teamLog.info("Role deleted");

    return NextResponse.json({
      success: true,
      message: `Role "${role.name}" has been deleted`,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error deleting role");
    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    );
  }
}
