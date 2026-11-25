import { getGeneratedThumbnail } from "@/lib/cloud/thumbnail-storage";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { Permission } from "@/lib/teams/permission-service";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamFileService } from "@/lib/teams/team-file-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Check download permission (viewing thumbnails requires download permission)
    const permError = await requireTeamPermission(teamId, userId, Permission.DOWNLOAD);
    if (permError) return permError;

    // Get file with thumbnail key from database
    const fullKey = `teams/${teamId}/${key}`;
    const fileRecord = await teamFileService.getFile(teamId, fullKey);

    if (!fileRecord || !fileRecord.thumbnailKey) {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    const thumbnail = await getGeneratedThumbnail(fileRecord.thumbnailKey);
    if (!thumbnail) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    return new NextResponse(thumbnail.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    teamLog.error({ err: error }, "Error getting thumbnail");
    return NextResponse.json(
      { error: "Failed to get thumbnail" },
      { status: 500 }
    );
  }
}
