import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teams, teamMembers, teamInvitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { logMemberJoin } from "@/lib/teams/activity-service";
import { chatService } from "@/lib/teams/chat-service";
import { requireAuth } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


/**
 * POST /api/teams/invitations/accept
 * Accept a team invitation
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find invitation by token
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status}` },
        { status: 400 }
      );
    }

    // Check if invitation has expired
    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await db
        .update(teamInvitations)
        .set({ status: "expired" })
        .where(eq(teamInvitations.id, invitation.id));

      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 410 }
      );
    }

    // Require a verified address on the account that matches the invitation
    const userEmail = user.emailAddresses
      .find((e) => e.verification?.status === "verified" && e.emailAddress.toLowerCase() === invitation.email)
      ?.emailAddress.toLowerCase();
    if (!userEmail) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const [existingMember] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, invitation.teamId),
          eq(teamMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingMember) {
      // Mark invitation as accepted
      await db
        .update(teamInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(teamInvitations.id, invitation.id));

      return NextResponse.json(
        { error: "You are already a member of this team" },
        { status: 409 }
      );
    }

    // Atomically check and increment member count (prevents race condition)
    const added = await teamQuotaService.tryIncrementMemberCount(invitation.teamId);
    if (!added) {
      return NextResponse.json(
        { error: "Team is at maximum capacity" },
        { status: 402 }
      );
    }

    // Add user as team member (rollback count on failure)
    try {
      await db.insert(teamMembers).values({
        teamId: invitation.teamId,
        userId,
        roleId: invitation.roleId,
        canUpload: invitation.canUpload,
        canDownload: invitation.canDownload,
        canDelete: invitation.canDelete,
        canShare: invitation.canShare,
        canManageMembers: invitation.canManageMembers,
        canViewActivity: invitation.canViewActivity,
        canChat: invitation.canChat,
        invitedBy: invitation.invitedBy,
      });
    } catch (insertError) {
      await teamQuotaService.decrementMemberCount(invitation.teamId);
      throw insertError;
    }

    // Mark invitation as accepted
    await db
      .update(teamInvitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(teamInvitations.id, invitation.id));

    // Get team info for response
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, invitation.teamId))
      .limit(1);

    // Log activity
    await logMemberJoin(
      invitation.teamId,
      userId,
      userEmail || userId,
      invitation.invitedBy
    );

    // Send system message to chat
    await chatService.sendSystemMessage(
      invitation.teamId,
      `${user.fullName || userEmail} joined the team`
    );

    teamLog.info("Invitation accepted");

    return NextResponse.json({
      success: true,
      message: `You have joined ${team?.name || "the team"}`,
      team: {
        id: team?.id,
        name: team?.name,
        slug: team?.slug,
      },
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error accepting invitation");
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
