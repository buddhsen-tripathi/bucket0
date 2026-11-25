import { runInBackground } from "@/server/context";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { teamShareLinks, teamFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { Permission } from "@/lib/teams/permission-service";
import { logFileShare, logFileUnshare } from "@/lib/teams/activity-service";
import { teamLog } from "@/lib/shared/logger";

type AccessType = "anyone" | "protected";

// POST - Create or update share link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // Auth check
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    // Permission check - need SHARE permission
    const permResult = await requireTeamPermission(teamId, userId, Permission.SHARE);
    if (permResult) return permResult;

    const {
      key,
      accessType = "anyone",
      allowDownload = true,
      allowAddToDrive = true,
    } = await request.json();

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Validate permission flags
    const validAllowDownload = allowDownload !== false;
    const validAllowAddToDrive = allowAddToDrive !== false;

    // Reconstruct full file key (stored as teams/{teamId}/{filename})
    const fullFileKey = key.startsWith("teams/") ? key : `teams/${teamId}/${key}`;
    // Verify file exists in team
    const [file] = await db
      .select()
      .from(teamFiles)
      .where(
        and(
          eq(teamFiles.teamId, teamId),
          eq(teamFiles.fileKey, fullFileKey)
        )
      )
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "File not found in team" }, { status: 404 });
    }

    const validAccessType: AccessType = accessType === "protected" ? "protected" : "anyone";
    const fileName = fullFileKey.split("/").pop() || key;

    // Check for existing active share link
    const [existingLink] = await db
      .select()
      .from(teamShareLinks)
      .where(
        and(
          eq(teamShareLinks.teamId, teamId),
          eq(teamShareLinks.fileKey, key),
          eq(teamShareLinks.isActive, true)
        )
      )
      .limit(1);

    let shareLink;

    if (existingLink) {
      // Update existing link
      const [updated] = await db
        .update(teamShareLinks)
        .set({
          accessType: validAccessType,
          allowDownload: validAllowDownload,
          allowAddToDrive: validAllowAddToDrive,
        })
        .where(eq(teamShareLinks.id, existingLink.id))
        .returning();
      shareLink = updated;
    } else {
      // Create new share link
      const [created] = await db.insert(teamShareLinks).values({
        teamId,
        createdBy: userId,
        fileKey: key,
        fileName,
        accessType: validAccessType,
        allowDownload: validAllowDownload,
        allowAddToDrive: validAllowAddToDrive,
        isActive: true,
      }).returning();
      shareLink = created;
    }

    // Build share URL - use /ts/ prefix for team shares
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const shareUrl = `${baseUrl}/ts/${shareLink.id}`;

    // Log activity (non-blocking) - only log for new share links, not updates
    if (!existingLink) {
      await runInBackground(logFileShare(teamId, userId, fileName, validAccessType, shareUrl, fullFileKey).catch((err) => {
        teamLog.error({ err }, "Failed to log share activity");
      }));
    }

    teamLog.info("Team share link created");

    return NextResponse.json({
      shareUrl,
      linkId: shareLink.id,
      accessType: shareLink.accessType,
      allowDownload: shareLink.allowDownload,
      allowAddToDrive: shareLink.allowAddToDrive,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Share link creation error");
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

// GET - Get existing share link for a file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // Auth check
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    // Permission check
    const permResult = await requireTeamPermission(teamId, userId, Permission.SHARE);
    if (permResult) return permResult;

    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get("key");

    if (!fileKey) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    const [existingLink] = await db
      .select()
      .from(teamShareLinks)
      .where(
        and(
          eq(teamShareLinks.teamId, teamId),
          eq(teamShareLinks.fileKey, fileKey),
          eq(teamShareLinks.isActive, true)
        )
      )
      .limit(1);

    if (!existingLink) {
      return NextResponse.json({ exists: false });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const shareUrl = `${baseUrl}/ts/${existingLink.id}`;

    return NextResponse.json({
      exists: true,
      shareUrl,
      linkId: existingLink.id,
      accessCount: existingLink.accessCount,
      accessType: existingLink.accessType,
      allowDownload: existingLink.allowDownload,
      allowAddToDrive: existingLink.allowAddToDrive,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Share link error");
    return NextResponse.json(
      { error: "Failed to get share link" },
      { status: 500 }
    );
  }
}

// DELETE - Revoke a share link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // Auth check
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    // Permission check
    const permResult = await requireTeamPermission(teamId, userId, Permission.SHARE);
    if (permResult) return permResult;

    const { linkId } = await request.json();

    if (!linkId) {
      return NextResponse.json({ error: "Link ID required" }, { status: 400 });
    }

    // Revoke the link (must belong to this team)
    const result = await db
      .update(teamShareLinks)
      .set({ isActive: false })
      .where(
        and(
          eq(teamShareLinks.id, linkId),
          eq(teamShareLinks.teamId, teamId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Log activity (non-blocking)
    const revokedLink = result[0];
    await runInBackground(logFileUnshare(teamId, userId, revokedLink.fileName, revokedLink.fileKey).catch((err) => {
      teamLog.error({ err }, "Failed to log unshare activity");
    }));

    teamLog.info("Team share link revoked");

    return NextResponse.json({ success: true });
  } catch (error) {
    teamLog.error({ err: error }, "Share link revoke error");
    return NextResponse.json(
      { error: "Failed to revoke share link" },
      { status: 500 }
    );
  }
}
