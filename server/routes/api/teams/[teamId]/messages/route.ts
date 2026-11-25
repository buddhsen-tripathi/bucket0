import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { clerkClient } from "@/server/compat/clerk";
import { Permission } from "@/lib/teams/permission-service";
import { chatService } from "@/lib/teams/chat-service";
import { activityService } from "@/lib/teams/activity-service";
import { requireAuth, requireTeamPermission, requireTeamFeature } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * GET /api/teams/[teamId]/messages
 * Get team messages (paginated)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.CHAT);
    if (permError) return permError;

    const featureError = await requireTeamFeature(teamId, "chatEnabled");
    if (featureError) return featureError;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const fileId = searchParams.get("fileId");

    const messages = await chatService.getTeamMessages(teamId, {
      limit,
      offset,
      fileId: fileId || undefined,
    });

    const total = await chatService.getMessageCount(teamId);

    // Get unique user IDs from messages (excluding system messages)
    const userIds = [...new Set(
      messages
        .filter((m) => m.userId !== "system")
        .map((m) => m.userId)
    )];

    // Fetch user data from Clerk
    let userMap = new Map<string, { name: string; imageUrl: string }>();
    if (userIds.length > 0) {
      try {
        const client = await clerkClient();
        const clerkUsers = await client.users.getUserList({ userId: userIds });
        userMap = new Map(
          clerkUsers.data.map((u) => [
            u.id,
            {
              name: u.fullName || u.emailAddresses[0]?.emailAddress?.split("@")[0] || "Unknown",
              imageUrl: u.imageUrl,
            },
          ])
        );
      } catch (err) {
        teamLog.error({ err }, "Error fetching user data");
      }
    }

    // Enrich messages with user data
    const enrichedMessages = messages.map((message) => ({
      ...message,
      user: message.userId === "system" ? null : userMap.get(message.userId) || null,
    }));

    return NextResponse.json({
      messages: enrichedMessages,
      total,
      limit,
      offset,
      hasMore: offset + messages.length < total,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error getting messages");
    return NextResponse.json(
      { error: "Failed to get messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teams/[teamId]/messages
 * Send a new message
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    const permError = await requireTeamPermission(teamId, userId, Permission.CHAT);
    if (permError) return permError;

    const featureError = await requireTeamFeature(teamId, "chatEnabled");
    if (featureError) return featureError;

    const body = await request.json();
    const { content, fileId, parentId } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { error: "Message too long (max 5000 characters)" },
        { status: 400 }
      );
    }

    const message = await chatService.sendMessage({
      teamId,
      userId,
      content: content.trim(),
      type: fileId ? "file_comment" : "text",
      fileId,
      parentId,
    });

    // Log file comment activity
    if (fileId) {
      await activityService.logActivity({
        teamId,
        userId,
        action: "file.share", // Using share as "commented on"
        resourceType: "file",
        resourceId: fileId,
        description: "Commented on file",
        metadata: { messageId: message.id },
      });
    }

    // Fetch user data for the sender
    let userData = null;
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      userData = {
        name: clerkUser.fullName || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || "Unknown",
        imageUrl: clerkUser.imageUrl,
      };
    } catch (err) {
      teamLog.error({ err }, "Error fetching sender data");
    }

    teamLog.info("Message sent");

    return NextResponse.json({
      message: {
        ...message,
        user: userData,
      },
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error sending message");
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
