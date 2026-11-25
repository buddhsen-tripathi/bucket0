import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teamInvitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Permission } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string; invitationId: string }>;
}

/**
 * GET /api/teams/[teamId]/invitations/[invitationId]
 * Get a specific invitation
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId, invitationId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    // Get the invitation
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.teamId, teamId)
        )
      )
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ invitation });
  } catch (error) {
    teamLog.error({ err: error }, "Error getting invitation");
    return NextResponse.json(
      { error: "Failed to get invitation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/invitations/[invitationId]
 * Cancel a pending invitation
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId, invitationId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    // Get the invitation first (for logging)
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.teamId, teamId)
        )
      )
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Check if invitation is already accepted
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cannot cancel an invitation that has already been accepted" },
        { status: 400 }
      );
    }

    // Delete the invitation
    await db
      .delete(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.teamId, teamId)
        )
      );

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "member.invite_cancel",
      resourceType: "invitation",
      resourceId: invitationId,
      description: `Cancelled invitation for ${invitation.email}`,
      metadata: { email: invitation.email },
    });

    teamLog.info("Invitation cancelled");

    return NextResponse.json({
      success: true,
      message: `Invitation for ${invitation.email} has been cancelled`,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error cancelling invitation");
    return NextResponse.json(
      { error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}
