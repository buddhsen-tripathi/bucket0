/**
 * Agent Folder Creation
 *
 * POST /api/agent-bucket/files/folder - Create a folder via Bearer token auth
 * Body: { path: "reports" } or { path: "reports/daily" }
 *
 * Folders are 0-byte objects with trailing slash in R2.
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { systemStorage } from "@/lib/cloud/system-service";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { agentLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";


/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { path } = body;

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "Folder path is required" }, { status: 400 });
    }

    if (path.includes("..") || path.includes("//")) {
      return NextResponse.json({ error: "Invalid folder path" }, { status: 400 });
    }

    const sanitizedPath = path
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9._\-\/]/g, "_")
      .replace(/\/+$/, ""); // strip trailing slashes before normalizing

    if (!sanitizedPath || sanitizedPath === "/") {
      return NextResponse.json({ error: "Folder path cannot be empty" }, { status: 400 });
    }

    const normalizedPath = `${sanitizedPath}/`;

    await systemStorage.uploadFile(
      userId,
      normalizedPath,
      Buffer.alloc(0),
      "application/x-directory"
    );

    // Create cloudFiles record so the drive listing filter can exclude agent folders
    const fileKey = `users/${userId}/${normalizedPath}`;
    const existing = await db
      .select({ id: cloudFiles.id })
      .from(cloudFiles)
      .where(and(eq(cloudFiles.userId, userId), eq(cloudFiles.fileKey, fileKey)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(cloudFiles).values({
        userId,
        fileKey,
        fileName: normalizedPath,
        fileSize: 0,
        mimeType: "application/x-directory",
        encrypted: false,
        encryptionMode: "none",
        iv: "00000000000000000000000000000000",
        isAgentUpload: true,
        folderPath: cloudCatalog.deriveFolderPath(userId, fileKey),
      });
    }

    await cloudCatalog
      .createFolder(userId, normalizedPath, { isAgentUpload: true })
      .catch((err) => agentLog.error({ err }, "catalog folder sync failed"));

    agentLog.info({ path: normalizedPath }, "Agent folder created");

    return NextResponse.json({ success: true, path: normalizedPath });
  } catch (error) {
    agentLog.error({ err: error }, "Agent folder creation error");
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
