import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { permissionService } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * PATCH /api/teams/[teamId]/settings
 * Update team default permissions (owner only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { teamId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only owner can update settings
    const isOwner = await permissionService.isTeamOwner(teamId, userId);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only team owner can update settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      defaultCanUpload,
      defaultCanDownload,
      defaultCanDelete,
      defaultCanShare,
    } = body;

    // Get current team
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Parse existing settings and merge with new ones
    let existingSettings = {};
    if (team.settings) {
      try {
        existingSettings = JSON.parse(team.settings);
      } catch {
        // Ignore parse errors
      }
    }

    const newSettings = {
      ...existingSettings,
      defaultCanUpload: defaultCanUpload ?? true,
      defaultCanDownload: defaultCanDownload ?? true,
      defaultCanDelete: defaultCanDelete ?? false,
      defaultCanShare: defaultCanShare ?? true,
    };

    // Update team settings
    await db
      .update(teams)
      .set({
        settings: JSON.stringify(newSettings),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "team.settings_change",
      resourceType: "team",
      resourceId: teamId,
      description: "Updated default member permissions",
      metadata: { settings: newSettings },
    });

    teamLog.info("Team settings updated");

    return NextResponse.json({
      success: true,
      settings: newSettings,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error updating settings");
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
