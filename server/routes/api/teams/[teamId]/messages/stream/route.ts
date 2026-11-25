import { NextRequest } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { permissionService, Permission } from "@/lib/teams/permission-service";
import { chatService } from "@/lib/teams/chat-service";
import { requireTeamFeature } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

// Membership, permission and plan feature, re-checked while the stream is open
const AUTH_RECHECK_MS = 30_000;

async function isAllowed(teamId: string, userId: string) {
  const [hasPermission, isOwner] = await Promise.all([
    permissionService.hasPermission(teamId, userId, Permission.CHAT),
    permissionService.isTeamOwner(teamId, userId),
  ]);
  if (!hasPermission && !isOwner) return false;
  return !(await requireTeamFeature(teamId, "chatEnabled"));
}

/**
 * GET /api/teams/[teamId]/messages/stream
 * Server-Sent Events stream for real-time chat messages
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

      // Poll for new messages every 2 seconds (faster than activity for chat)
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

          const recentMessages = await chatService.getRecentMessages(
            teamId,
            5 // Last 5 seconds
          );

          if (recentMessages.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "messages", data: recentMessages })}\n\n`
              )
            );
          }
        } catch (error) {
          teamLog.error({ err: error }, "Chat stream poll error");
        } finally {
          polling = false;
        }
      }, 2000);
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
