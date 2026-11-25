import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teams, teamInvitations, teamMembers, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Permission, permissionService } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { sendInvitationEmail } from "@/lib/email/resend";
import crypto from "crypto";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/invitations
 * List pending invitations
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    const invitations = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.status, "pending")
        )
      );

    return NextResponse.json({ invitations });
  } catch (error) {
    teamLog.error({ err: error }, "Error listing invitations");
    return NextResponse.json(
      { error: "Failed to list invitations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams/[teamId]/invitations
 * Send a new invitation
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const user = await currentUser();
    const { teamId } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permError = await requireTeamPermission(teamId, userId, Permission.MANAGE_MEMBERS);
    if (permError) return permError;

    const body = await request.json();
    const {
      email,
      roleId,
      canUpload = true,
      canDownload = true,
      canDelete = false,
      canShare = true,
      canManageMembers = false,
      canViewActivity = false,
      canChat = true,
    } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Check team member limit (based on owner's plan)
    const canAdd = await teamQuotaService.canAddMember(teamId);
    if (!canAdd) {
      const teamLimits = await teamQuotaService.getTeamLimits(teamId);
      const maxMembers = teamLimits?.maxMembers ?? 4;
      return NextResponse.json(
        {
          error: `Team is at maximum capacity (${maxMembers} members including owner). Upgrade plan for more members.`,
          code: "MEMBER_LIMIT_REACHED",
          currentMembers: teamLimits?.memberCount ?? 0,
          maxMembers,
        },
        { status: 402 }
      );
    }

    // Check if email already belongs to a team member
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const [existingMember] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(users.email, normalizedEmail)
        )
      )
      .limit(1);

    if (existingMember) {
      return NextResponse.json(
        { error: "This user is already a member of the team" },
        { status: 409 }
      );
    }

    // Check for existing pending invitation
    const [existingInvite] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.email, normalizedEmail),
          eq(teamInvitations.status, "pending")
        )
      )
      .limit(1);

    if (existingInvite) {
      const maxResendCount = 3;
      return NextResponse.json(
        {
          error: "An invitation is already pending for this email",
          pendingInvitation: {
            id: existingInvite.id,
            email: existingInvite.email,
            resendCount: existingInvite.resendCount,
            maxResendCount,
            canResend: existingInvite.resendCount < maxResendCount,
            expiresAt: existingInvite.expiresAt,
          },
        },
        { status: 409 }
      );
    }

    // Check if current user is team owner (needed for canManageMembers grant)
    const isOwner = await permissionService.isTeamOwner(teamId, userId);

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await db
      .insert(teamInvitations)
      .values({
        teamId,
        email: normalizedEmail,
        roleId,
        invitedBy: userId,
        token,
        status: "pending",
        canUpload,
        canDownload,
        canDelete,
        canShare,
        canManageMembers: isOwner ? canManageMembers : false, // Only owner can grant this
        canViewActivity,
        canChat,
        expiresAt,
      })
      .returning();

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "member.invite",
      resourceType: "invitation",
      resourceId: invitation.id,
      description: `Invited ${normalizedEmail} to the team`,
      metadata: { email: normalizedEmail, roleId },
    });

    // Build accept URL using NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const acceptUrl = `${baseUrl}/invite/${token}`;

    // Send invitation email
    const inviterName = user.fullName || user.emailAddresses[0]?.emailAddress || "A team member";
    const emailResult = await sendInvitationEmail({
      to: normalizedEmail,
      teamName: team.name,
      inviterName,
      acceptUrl,
      expiresAt,
    });

    teamLog.info("Invitation created");

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
      emailSent: emailResult.success,
      // Include accept URL for manual sharing if email fails
      acceptUrl: !emailResult.success ? acceptUrl : undefined,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error creating invitation");
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
