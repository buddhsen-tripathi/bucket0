import { NextResponse } from "@/server/compat/next-server";
import { auth, clerkClient, type Session } from "@/server/compat/clerk";
import { userLog } from "@/lib/shared/logger";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const sessions = await client.sessions.getSessionList({ userId });
    
    // Format sessions for frontend
    const formattedSessions = sessions.data.map((session: Session) => {
      const activity = session.latestActivity;
      
      return {
        id: session.id,
        status: session.status,
        lastActiveAt: session.lastActiveAt,
        expireAt: session.expireAt,
        clientId: session.clientId,
        // SessionActivity properties from Clerk
        userAgent: activity?.deviceType || 'Unknown device',
        browser: activity?.browserName 
          ? `${activity.browserName}${activity.browserVersion ? ' ' + activity.browserVersion : ''}`
          : 'Unknown browser',
        ipAddress: activity?.ipAddress || 'Unknown',
        city: activity?.city || 'Unknown',
        country: activity?.country || 'Unknown',
        isMobile: activity?.isMobile || false,
      };
    });

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error) {
    userLog.error({ err: error }, "Failed to fetch sessions");
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID required" },
        { status: 400 }
      );
    }

    const client = await clerkClient();
    const session = await client.sessions.getSession(sessionId).catch(() => null);
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    await client.sessions.revokeSession(session.id);

    userLog.info("Session revoked");
    return NextResponse.json({ success: true });
  } catch (error) {
    userLog.error({ err: error }, "Failed to revoke session");
    return NextResponse.json(
      { error: "Failed to revoke session" },
      { status: 500 }
    );
  }
}
