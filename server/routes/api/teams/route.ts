import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { permissionService } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { canCreateTeam, getMaxTeams, getMaxTeamMembers, getPlanLimits } from "@/lib/payments/plans";
import { dbService } from "@/lib/shared/db-service";
import { requireAuth } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


/**
 * Generate URL-friendly slug from team name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50) + "-" + Math.random().toString(36).substring(2, 8);
}

/**
 * GET /api/teams
 * List all teams the current user is a member of
 */
export async function GET() {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const userTeams = await permissionService.getUserTeams(userId);

    // Combine owned and member teams with role info
    const allTeams = [
      ...userTeams.owned.map((team) => ({
        ...team,
        role: "owner" as const,
        isOwner: true,
      })),
      ...userTeams.memberOf.map((team) => ({
        ...team,
        role: "member" as const,
        isOwner: false,
      })),
    ];

    return NextResponse.json({ teams: allTeams });
  } catch (error) {
    teamLog.error({ err: error }, "Error listing teams");
    return NextResponse.json(
      { error: "Failed to list teams" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams
 * Create a new team (requires Starter plan or higher)
 * Team storage is shared from owner's plan quota
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database to check their plan
    const dbUser = await dbService.getUser(
      userId,
      clerkUser.emailAddresses[0]?.emailAddress || ""
    );

    // Check if user's plan allows team creation
    if (!canCreateTeam(dbUser.plan)) {
      return NextResponse.json(
        {
          error: "Team feature requires Starter plan or higher",
          code: "PLAN_REQUIRED",
          requiredPlan: "starter",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
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

    // Check how many teams user already owns
    const existingTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.ownerId, userId));

    const maxTeamsAllowed = getMaxTeams(dbUser.plan);
    if (existingTeams.length >= maxTeamsAllowed) {
      return NextResponse.json(
        {
          error: `Maximum ${maxTeamsAllowed} team${maxTeamsAllowed > 1 ? "s" : ""} allowed on your plan`,
          code: "TEAM_LIMIT_REACHED",
        },
        { status: 402 }
      );
    }

    // Generate unique slug
    const slug = generateSlug(name.trim());

    // Create team
    const [team] = await db
      .insert(teams)
      .values({
        name: name.trim(),
        slug,
        ownerId: userId,
        memberCount: 1, // Owner counts as first member
      })
      .returning();

    // Log activity
    await activityService.logActivity({
      teamId: team.id,
      userId,
      action: "team.create",
      resourceType: "team",
      resourceId: team.id,
      description: `Created team "${team.name}"`,
      metadata: { teamName: team.name },
    });

    // Return limits based on owner's plan
    const planLimits = getPlanLimits(dbUser.plan);
    const maxMembers = getMaxTeamMembers(dbUser.plan);

    teamLog.info("Team created");

    return NextResponse.json({
      team: {
        ...team,
        role: "owner",
        isOwner: true,
      },
      limits: {
        maxMembers: maxMembers + 1, // +1 includes owner
        maxStorageBytes: planLimits.maxStorageBytes,
        maxFileSizeBytes: planLimits.maxFileSizeBytes,
        ownerStorageUsage: dbUser.storageUsage, // Show how much storage is already used
      },
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error creating team");
    return NextResponse.json(
      { error: "Failed to create team" },
      { status: 500 }
    );
  }
}
