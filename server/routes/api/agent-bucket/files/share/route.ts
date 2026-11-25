/**
 * Agent Share Link
 *
 * POST /api/agent-bucket/files/share - Create a public share link for a file
 * via Bearer token auth. Returns a clean /s/{id} page URL plus a direct
 * streaming URL usable in a <video> tag. Both are server-proxied through
 * /api/cloud/share/stream (range/seek supported), so no R2 details are exposed.
 *
 * Body: { key: string, allowDownload?: boolean }
 *   key: relative file key, e.g. "videos/clip.mp4"
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { cloudFiles, shareLinks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";
import { agentLog } from "@/lib/shared/logger";


/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    // Bearer token auth
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId, keyId } = authResult;

    // Rate limiting: reuse the share-link limiter (100/hour)
    const rateLimitResult = await RateLimiters.shareLink(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before creating more share links." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await request.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const allowDownload = body.allowDownload !== false;

    if (!key || key.includes("..") || key.endsWith("/")) {
      return NextResponse.json({ error: "Valid file key required" }, { status: 400 });
    }

    // Verify the file exists in this key owner's Agent Storage — no dead links,
    // and scoped to agent-uploaded files (least privilege) so a leaked key can't
    // mint public links to the owner's personal drive files.
    const fullKey = `users/${userId}/${key}`;
    const [file] = await db
      .select({ id: cloudFiles.id })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fullKey),
          eq(cloudFiles.isAgentUpload, true)
        )
      )
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "Agent file not found" }, { status: 404 });
    }

    const fileName = key.split("/").pop() || key;

    // Reuse an existing active link for this file, else create one.
    const [existing] = await db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.userId, userId),
          eq(shareLinks.fileKey, key),
          eq(shareLinks.targetType, "file"),
          eq(shareLinks.isActive, true)
        )
      )
      .limit(1);

    let linkId: string;
    if (existing) {
      linkId = existing.id;
    } else {
      const [created] = await db
        .insert(shareLinks)
        .values({
          userId,
          fileKey: key,
          fileName,
          targetType: "file",
          accessType: "anyone",
          allowDownload,
          // Streaming links are for viewing, not re-adding to a stranger's drive.
          allowAddToDrive: false,
          isActive: true,
        })
        .returning({ id: shareLinks.id });
      linkId = created.id;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    agentLog.info({ key, keyId }, "Agent share link created");

    return NextResponse.json({
      success: true,
      linkId,
      shareUrl: `${baseUrl}/s/${linkId}`,
      streamUrl: `${baseUrl}/api/cloud/share/stream?id=${linkId}`,
    });
  } catch (error) {
    agentLog.error({ err: error }, "Agent share link error");
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
