import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { requireAuth, requireTeamMember } from "@/lib/teams/route-helpers";
import { teamLog } from "@/lib/shared/logger";
import { logBatchUpload } from "@/lib/teams/activity-service";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * POST /api/teams/[teamId]/activity/batch
 * Log batch upload activity (called after folder/multiple file upload)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    // Verify user is team member
    const memberError = await requireTeamMember(teamId, userId);
    if (memberError) return memberError;

    const { fileNames, totalSize } = await request.json();

    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return NextResponse.json(
        { error: "fileNames array required" },
        { status: 400 }
      );
    }

    await logBatchUpload(teamId, userId, fileNames, totalSize || 0);

    return NextResponse.json({ success: true });
  } catch (error) {
    teamLog.error({ err: error }, "Error logging batch activity");
    return NextResponse.json(
      { error: "Failed to log activity" },
      { status: 500 }
    );
  }
}
