import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teams, teamInvitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Permission } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { sendInvitationEmail } from "@/lib/email/resend";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


const MAX_RESEND_COUNT = 3;

interface RouteParams {
  params: Promise<{ teamId: string; invitationId: string }>;
}

/**
 * POST /api/teams/[teamId]/invitations/[invitationId]/resend
 * Resend a pending invitation email (max 3 times)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const user = await currentUser();
    const { teamId, invitationId } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permError = await requireTeamPermission(teamId, userId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    // Get the invitation
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.status, "pending")
        )
      )
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or already accepted" },
        { status: 404 }
      );
    }

    // Check resend limit
    if (invitation.resendCount >= MAX_RESEND_COUNT) {
      return NextResponse.json(
        {
          error: `Maximum resend limit reached (${MAX_RESEND_COUNT} times)`,
          resendCount: invitation.resendCount,
          maxResendCount: MAX_RESEND_COUNT,
        },
        { status: 429 }
      );
    }

    // Get team info for email
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Build accept URL using NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const acceptUrl = `${baseUrl}/invite/${invitation.token}`;

    // Send invitation email
    const inviterName = user.fullName || user.emailAddresses[0]?.emailAddress || "A team member";
    const emailResult = await sendInvitationEmail({
      to: invitation.email,
      teamName: team.name,
      inviterName,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send email" },
        { status: 500 }
      );
    }

    // Update resend count
    const newResendCount = invitation.resendCount + 1;
    await db
      .update(teamInvitations)
      .set({
        resendCount: newResendCount,
        lastResentAt: new Date(),
      })
      .where(eq(teamInvitations.id, invitationId));

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "member.invite_resend",
      resourceType: "invitation",
      resourceId: invitation.id,
      description: `Resent invitation to ${invitation.email}`,
      metadata: { email: invitation.email, resendCount: newResendCount },
    });

    teamLog.info("Invitation resent");

    return NextResponse.json({
      success: true,
      resendCount: newResendCount,
      maxResendCount: MAX_RESEND_COUNT,
      remainingResends: MAX_RESEND_COUNT - newResendCount,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error resending invitation");
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}
