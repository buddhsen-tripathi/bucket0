import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teamRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { activityService } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamMember, requireTeamOwner } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/roles
 * List all custom roles for a team
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const memberError = await requireTeamMember(teamId, userId);
    if (memberError) return memberError;

    const roles = await db
      .select()
      .from(teamRoles)
      .where(eq(teamRoles.teamId, teamId));

    return NextResponse.json({ roles });
  } catch (error) {
    teamLog.error({ err: error }, "Error listing roles");
    return NextResponse.json(
      { error: "Failed to list roles" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams/[teamId]/roles
 * Create a new custom role (owner only)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const ownerError = await requireTeamOwner(teamId, userId);
    if (ownerError) return ownerError;

    const body = await request.json();
    const {
      name,
      description,
      canUpload = true,
      canDownload = true,
      canDelete = false,
      canShare = true,
      canManageMembers = false,
      canViewActivity = false,
      canChat = true,
    } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Role name must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: "Role name must be less than 50 characters" },
        { status: 400 }
      );
    }

    // Check for existing role with same name
    const existingRoles = await db
      .select()
      .from(teamRoles)
      .where(eq(teamRoles.teamId, teamId));

    if (existingRoles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 }
      );
    }

    // Limit to 10 custom roles per team
    if (existingRoles.length >= 10) {
      return NextResponse.json(
        { error: "Maximum 10 custom roles per team" },
        { status: 402 }
      );
    }

    const [role] = await db
      .insert(teamRoles)
      .values({
        teamId,
        name: name.trim(),
        description: description?.trim(),
        canUpload,
        canDownload,
        canDelete,
        canShare,
        canManageMembers,
        canViewActivity,
        canChat,
      })
      .returning();

    // Log activity
    await activityService.logActivity({
      teamId,
      userId,
      action: "role.create",
      resourceType: "role",
      resourceId: role.id,
      description: `Created role "${role.name}"`,
      metadata: { roleName: role.name },
    });

    teamLog.info("Role created");

    return NextResponse.json({ role });
  } catch (error) {
    teamLog.error({ err: error }, "Error creating role");
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 }
    );
  }
}
