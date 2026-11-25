import { NextRequest } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { permissionService, Permission } from "@/lib/teams/permission-service";
import { activityService } from "@/lib/teams/activity-service";
import { requireTeamFeature } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

// Membership, permission and plan feature, re-checked while the stream is open
const AUTH_RECHECK_MS = 30_000;

async function isAllowed(teamId: string, userId: string) {
  const [hasPermission, isOwner] = await Promise.all([
    permissionService.hasPermission(teamId, userId, Permission.VIEW_ACTIVITY),
    permissionService.isTeamOwner(teamId, userId),
  ]);
  if (!hasPermission && !isOwner) return false;
  return !(await requireTeamFeature(teamId, "activityLogsEnabled"));
}

/**
 * GET /api/teams/[teamId]/activity/stream
 * Server-Sent Events stream for real-time activity updates
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  const { teamId } = await params;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!(await isAllowed(teamId, userId))) {
    return new Response("Permission denied", { status: 403 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      // Poll for new activities every 5 seconds
      let lastAuthCheck = Date.now();
      let polling = false;
      intervalId = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          if (Date.now() - lastAuthCheck >= AUTH_RECHECK_MS) {
            if (!(await isAllowed(teamId, userId))) {
              clearInterval(intervalId);
              controller.close();
              return;
            }
            lastAuthCheck = Date.now();
          }

          const recentActivities = await activityService.getRecentActivity(
            teamId,
            10 // Last 10 seconds
          );

          if (recentActivities.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "activities", data: recentActivities })}\n\n`
              )
            );
          }
        } catch (error) {
          teamLog.error({ err: error }, "Activity stream poll error");
        } finally {
          polling = false;
        }
      }, 5000);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  });

  // Handle client disconnect
  request.signal.addEventListener("abort", () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
