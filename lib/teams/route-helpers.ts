/**
 * Team Route Helpers
 * Reduces boilerplate auth + permission checks across team API routes.
 * NOT middleware - just helper functions that return early-exit responses.
 */

import { NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { permissionService, Permission } from "@/lib/teams/permission-service";
import { teamQuotaService } from "@/lib/teams/team-quota-service";
import { getPlanLimits } from "@/lib/payments/plans";

type AuthResult =
  | { userId: string; error: null }
  | { userId: null; error: NextResponse };

/**
 * Extract and validate auth. Returns userId or a 401 response.
 */
export async function requireAuth(): Promise<AuthResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { userId, error: null };
}

/**
 * Check if user has a specific permission OR is team owner.
 * Parallelizes the two DB queries for performance.
 * Returns null if allowed, or a 403 response.
 */
export async function requireTeamPermission(
  teamId: string,
  userId: string,
  permission: Permission
): Promise<NextResponse | null> {
  const [hasPermission, isOwner] = await Promise.all([
    permissionService.hasPermission(teamId, userId, permission),
    permissionService.isTeamOwner(teamId, userId),
  ]);

  if (!hasPermission && !isOwner) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  return null;
}

/**
 * Check if user is the team owner.
 * Returns null if allowed, or a 403 response.
 */
export async function requireTeamOwner(
  teamId: string,
  userId: string
): Promise<NextResponse | null> {
  const isOwner = await permissionService.isTeamOwner(teamId, userId);
  if (!isOwner) {
    return NextResponse.json(
      { error: "Only team owner can perform this action" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check if user is a member (owner OR member) of the team.
 * Returns null if allowed, or a 403 response.
 */
export async function requireTeamMember(
  teamId: string,
  userId: string
): Promise<NextResponse | null> {
  const isMember = await permissionService.isTeamMember(teamId, userId);
  if (!isMember) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }
  return null;
}

export type TeamFeature = "activityLogsEnabled" | "chatEnabled";

/**
 * Check if a plan-level feature is enabled for the team's owner plan.
 * Returns null if enabled, or a 403 response.
 */
export async function requireTeamFeature(
  teamId: string,
  feature: TeamFeature
): Promise<NextResponse | null> {
  const owner = await teamQuotaService.getTeamOwner(teamId);
  if (!owner) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const limits = getPlanLimits(owner.plan);
  if (!limits[feature]) {
    const featureNames: Record<TeamFeature, string> = {
      activityLogsEnabled: "Activity logs",
      chatEnabled: "Team chat",
    };
    return NextResponse.json(
      { error: `${featureNames[feature]} is not available on the team owner's plan` },
      { status: 403 }
    );
  }
  return null;
}
