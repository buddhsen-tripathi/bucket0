import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { cloudFolders, shareLinks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { cloudLog } from "@/lib/shared/logger";

// Access types:
// - "anyone": Anyone with the link can access (no auth required)
// - "protected": Only authenticated Bucket0 users can access
type AccessType = "anyone" | "protected";
type TargetType = "file" | "folder";

function normalizeFolderKey(key: string): string {
  const segments = key.split("/").filter((segment) => segment && segment !== "..");
  return segments.length ? `${segments.join("/")}/` : "";
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: 100 share links per hour
    const rateLimitResult = await RateLimiters.shareLink(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before creating more share links." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const {
      key,
      targetType = "file",
      accessType = "anyone",
      allowDownload = true,
      allowAddToDrive = true,
    } = await request.json();

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    const validTargetType: TargetType = targetType === "folder" ? "folder" : "file";
    const normalizedKey = validTargetType === "folder" ? normalizeFolderKey(key) : key;
    if (!normalizedKey) {
      return NextResponse.json({ error: "Folder key required" }, { status: 400 });
    }

    if (validTargetType === "folder") {
      const [folder] = await db
        .select({ id: cloudFolders.id, name: cloudFolders.name })
        .from(cloudFolders)
        .where(
          and(
            eq(cloudFolders.userId, userId),
            eq(cloudFolders.isAgentUpload, false),
            eq(cloudFolders.path, normalizedKey)
          )
        )
        .limit(1);

      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    // Validate access type
    const validAccessType: AccessType = accessType === "protected" ? "protected" : "anyone";
    const validAllowDownload = allowDownload !== false;
    const validAllowAddToDrive = validTargetType === "folder" ? false : allowAddToDrive !== false;
    const fileName = validTargetType === "folder"
      ? normalizedKey.split("/").filter(Boolean).pop() || normalizedKey
      : normalizedKey.split("/").pop() || normalizedKey;

    // Check for existing active share link for this file
    const [existingLink] = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.userId, userId),
          eq(shareLinks.fileKey, normalizedKey),
          eq(shareLinks.targetType, validTargetType),
          eq(shareLinks.isActive, true)
        )
      )
      .limit(1);

    let shareLink;

    if (existingLink) {
      // Update existing link with new settings
      const [updated] = await db
        .update(shareLinks)
        .set({
          accessType: validAccessType,
          allowDownload: validAllowDownload,
          allowAddToDrive: validAllowAddToDrive,
        })
        .where(eq(shareLinks.id, existingLink.id))
        .returning();
      shareLink = updated;
    } else {
      // Create new share link
      const [created] = await db.insert(shareLinks).values({
        userId,
        fileKey: normalizedKey,
        fileName,
        targetType: validTargetType,
        accessType: validAccessType,
        allowDownload: validAllowDownload,
        allowAddToDrive: validAllowAddToDrive,
        isActive: true,
      }).returning();
      shareLink = created;
    }

    // Build share URL using NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const shareUrl = `${baseUrl}/s/${shareLink.id}`;
    cloudLog.info("Share link created");
    return NextResponse.json({
      shareUrl,
      linkId: shareLink.id,
      accessType: shareLink.accessType,
      allowDownload: shareLink.allowDownload,
      allowAddToDrive: shareLink.allowAddToDrive,
      targetType: shareLink.targetType,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Share link creation error");
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("id");
    const fileKey = searchParams.get("key");
    const targetType: TargetType = searchParams.get("targetType") === "folder" ? "folder" : "file";

    // If fileKey is provided, return existing share status for that file
    if (fileKey) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const [existingLink] = await db
        .select()
        .from(shareLinks)
        .where(
          and(
              eq(shareLinks.userId, userId),
            eq(shareLinks.fileKey, targetType === "folder" ? normalizeFolderKey(fileKey) : fileKey),
            eq(shareLinks.targetType, targetType),
            eq(shareLinks.isActive, true)
          )
        )
        .limit(1);

      if (!existingLink) {
        return NextResponse.json({ exists: false });
      }

      // Build share URL using NEXT_PUBLIC_APP_URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      const shareUrl = `${baseUrl}/s/${existingLink.id}`;
      return NextResponse.json({
        exists: true,
        shareUrl,
        linkId: existingLink.id,
        accessCount: existingLink.accessCount,
        accessType: existingLink.accessType,
        allowDownload: existingLink.allowDownload,
        allowAddToDrive: existingLink.allowAddToDrive,
        targetType: existingLink.targetType,
      });
    }

    // Otherwise, resolve a share link by ID (this is handled by /s/[id] page now)
    if (!linkId) {
      return NextResponse.json({ error: "Link ID or file key required" }, { status: 400 });
    }

    return NextResponse.json({ error: "Use /s/<id> to access shared files" }, { status: 400 });
  } catch (error) {
    cloudLog.error({ err: error }, "Share link error");
    return NextResponse.json(
      { error: "Failed to process share link" },
      { status: 500 }
    );
  }
}

// DELETE - Revoke a share link
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { linkId } = await request.json();

    if (!linkId) {
      return NextResponse.json({ error: "Link ID required" }, { status: 400 });
    }

    // Only allow owner to revoke
    const result = await db
      .update(shareLinks)
      .set({ isActive: false })
      .where(
        and(
          eq(shareLinks.id, linkId),
          eq(shareLinks.userId, userId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    cloudLog.info("Share link revoked");
    return NextResponse.json({ success: true });
  } catch (error) {
    cloudLog.error({ err: error }, "Share link revoke error");
    return NextResponse.json(
      { error: "Failed to revoke share link" },
      { status: 500 }
    );
  }
}
