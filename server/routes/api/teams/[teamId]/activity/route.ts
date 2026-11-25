import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { clerkClient } from "@/server/compat/clerk";
import { Permission } from "@/lib/teams/permission-service";
import { activityService, type ActivityAction, type ResourceType } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamPermission, requireTeamFeature } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/activity
 * Get team activity logs (paginated)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.VIEW_ACTIVITY);
    if (permError) return permError;

    // Check if activity logs are enabled for this team's plan
    const featureError = await requireTeamFeature(teamId, "activityLogsEnabled");
    if (featureError) return featureError;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const action = searchParams.get("action") as ActivityAction | null;
    const resourceType = searchParams.get("resourceType") as ResourceType | null;

    const activities = await activityService.getTeamActivity(teamId, {
      limit,
      offset,
      action: action || undefined,
      resourceType: resourceType || undefined,
    });

    const total = await activityService.getActivityCount(teamId);

    // Fetch user info for all unique userIds
    const userIds = [...new Set(activities.map((a) => a.userId))];
    const userMap: Record<string, { name: string; email: string; imageUrl: string | null }> = {};

    if (userIds.length > 0) {
      try {
        const clerk = await clerkClient();
        const users = await clerk.users.getUserList({ userId: userIds });
        for (const user of users.data) {
          userMap[user.id] = {
            name: user.fullName || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "Unknown",
            email: user.emailAddresses[0]?.emailAddress || "",
            imageUrl: user.imageUrl,
          };
        }
      } catch (err) {
        teamLog.error({ err }, "Failed to fetch user info for activity");
      }
    }

    // Enrich activities with user info
    const enrichedActivities = activities.map((activity) => ({
      ...activity,
      user: userMap[activity.userId] || { name: "Unknown", email: "", imageUrl: null },
    }));

    return NextResponse.json({
      activities: enrichedActivities,
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error getting activity");
    return NextResponse.json(
      { error: "Failed to get activity" },
      { status: 500 }
    );
  }
}
