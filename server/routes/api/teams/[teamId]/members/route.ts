import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teams, teamMembers, teamRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clerkClient } from "@/server/compat/clerk";
import { requireAuth, requireTeamMember } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/members
 * List all team members
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const memberError = await requireTeamMember(teamId, userId);
    if (memberError) return memberError;

    // Get team to include owner
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get all team members
    const members = await db
      .select({
        member: teamMembers,
        role: teamRoles,
      })
      .from(teamMembers)
      .leftJoin(teamRoles, eq(teamMembers.roleId, teamRoles.id))
      .where(eq(teamMembers.teamId, teamId));

    // Get Clerk user data for all members + owner
    const userIds = [team.ownerId, ...members.map((m) => m.member.userId)];
    const uniqueUserIds = [...new Set(userIds)];

    const client = await clerkClient();
    const clerkUsers = await client.users.getUserList({
      userId: uniqueUserIds,
    });

    const userMap = new Map(
      clerkUsers.data.map((u) => [
        u.id,
        {
          id: u.id,
          email: u.emailAddresses[0]?.emailAddress,
          name: u.fullName || u.emailAddresses[0]?.emailAddress?.split("@")[0],
          imageUrl: u.imageUrl,
        },
      ])
    );

    // Build response with owner first, filtering owner from members to avoid duplicates
    const ownerData = userMap.get(team.ownerId);
    const nonOwnerMembers = members.filter((m) => m.member.userId !== team.ownerId);
    const result = [
      {
        userId: team.ownerId,
        role: "owner",
        roleName: "Owner",
        user: ownerData,
        permissions: {
          canUpload: true,
          canDownload: true,
          canDelete: true,
          canShare: true,
          canManageMembers: true,
          canViewActivity: true,
          canChat: true,
        },
        joinedAt: team.createdAt,
        isOwner: true,
      },
      ...nonOwnerMembers.map((m) => ({
        userId: m.member.userId,
        role: m.role?.name || "member",
        roleName: m.role?.name || "Member",
        roleId: m.member.roleId,
        user: userMap.get(m.member.userId),
        permissions: {
          canUpload: m.member.canUpload,
          canDownload: m.member.canDownload,
          canDelete: m.member.canDelete,
          canShare: m.member.canShare,
          canManageMembers: m.member.canManageMembers,
          canViewActivity: m.member.canViewActivity,
          canChat: m.member.canChat,
        },
        joinedAt: m.member.joinedAt,
        invitedBy: m.member.invitedBy,
        isOwner: false,
      })),
    ];

    return NextResponse.json({ members: result, total: result.length });
  } catch (error) {
    teamLog.error({ err: error }, "Error listing members");
    return NextResponse.json(
      { error: "Failed to list members" },
      { status: 500 }
    );
  }
}
