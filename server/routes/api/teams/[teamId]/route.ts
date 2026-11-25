import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { permissionService } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { deleteTeamCompletely } from "@/lib/teams/team-deletion-service";
import { requireAuth, requireTeamMember, requireTeamOwner } from "@/lib/teams/route-helpers";
import { getPlanLimits } from "@/lib/payments/plans";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]
 * Get team details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const memberError = await requireTeamMember(teamId, userId);
    if (memberError) return memberError;

    // Get team details
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get member's permissions
    const permissions = await permissionService.getMemberPermissions(teamId, userId);

    // Get team limits based on owner's plan (not hardcoded team plan)
    const teamLimits = await teamQuotaService.getTeamLimits(teamId);

    // Parse team settings
    let settings = {
      defaultCanUpload: true,
      defaultCanDownload: true,
      defaultCanDelete: false,
      defaultCanShare: true,
    };
    if (team.settings) {
      try {
        const parsed = JSON.parse(team.settings);
        settings = { ...settings, ...parsed };
      } catch {
        // Use defaults if settings is invalid
      }
    }

    // Get plan-level feature flags for the frontend
    const ownerPlanLimits = teamLimits ? getPlanLimits(teamLimits.ownerPlan) : null;

    return NextResponse.json({
      team,
      permissions,
      settings,
      quota: teamLimits ? {
        storageLimit: teamLimits.storageLimit,
        storageUsed: teamLimits.ownerStorageUsage,
        teamStorageUsed: teamLimits.teamStorageUsage,
        availableStorage: Math.max(0, teamLimits.storageLimit - teamLimits.ownerStorageUsage),
        maxFileSizeBytes: teamLimits.maxFileSizeBytes,
        maxMembers: teamLimits.maxMembers,
        ownerPlan: teamLimits.ownerPlan,
      } : null,
      features: ownerPlanLimits ? {
        activityLogsEnabled: ownerPlanLimits.activityLogsEnabled,
        chatEnabled: ownerPlanLimits.chatEnabled,
        shareLinksEnabled: ownerPlanLimits.shareLinksEnabled,
      } : null,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error getting team");
    return NextResponse.json(
      { error: "Failed to get team" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/teams/[teamId]
 * Update team settings (owner only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    const body = await request.json();
    const { name, settings } = body;

    const updates: Partial<typeof teams.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return NextResponse.json(
          { error: "Team name must be at least 2 characters" },
          { status: 400 }
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { error: "Team name must be less than 100 characters" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (settings !== undefined) {
      updates.settings = JSON.stringify(settings);
    }

    const [updatedTeam] = await db
      .update(teams)
      .set(updates)
      .where(eq(teams.id, teamId))
      .returning();

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "team.update",
      resourceType: "team",
      resourceId: teamId,
      description: `Updated team settings`,
      metadata: { updates: Object.keys(updates) },
    });

    teamLog.info("Team updated");

    return NextResponse.json({ team: updatedTeam });
  } catch (error) {
    teamLog.error({ err: error }, "Error updating team");
    return NextResponse.json(
      { error: "Failed to update team" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]
 * Delete team (owner only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    // Get team for logging
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Delete the team and all of its data (DB rows, R2 objects, quota rollback)
    await deleteTeamCompletely(teamId);

    // TODO: Cancel Polar subscription if exists

    teamLog.info("Team deleted");

    return NextResponse.json({
      success: true,
      message: `Team "${team.name}" has been deleted`,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error deleting team");
    return NextResponse.json(
      { error: "Failed to delete team" },
      { status: 500 }
    );
  }
}
