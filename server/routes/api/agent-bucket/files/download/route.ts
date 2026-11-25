/**
 * Agent File Download
 *
 * GET /api/agent-bucket/files/download?key=xxx - Download a file via Bearer token auth
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { systemStorage } from "@/lib/cloud/system-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Readable } from "stream";
import { agentLog } from "@/lib/shared/logger";
import { requireAgentAuth } from "@/lib/agent/agent-route-helpers";

/** OPTIONS - CORS preflight (handled by middleware, this prevents 405) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAgentAuth(request);
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    const fullKey = `users/${userId}/${key}`;

    // Get file metadata (must be an agent upload)
    const [fileRecord] = await db
      .select()
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, fullKey),
          eq(cloudFiles.isAgentUpload, true)
        )
      )
      .limit(1);

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode } = fileRecord;
    const contentType = mimeType || "application/octet-stream";
    const fileName = key.split("/").pop() || key;

    // Fetch from R2
    const response = await systemStorage.getFileStream(userId, key);
    if (!response.Body) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === "none") {
      webStream = response.Body.transformToWebStream();
    } else if (encryptionMode === "chunked_gcm") {
      const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
      const decryptTransform = createDecryptStream(true);
      const decryptedStream = nodeStream.pipe(decryptTransform);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
    } else {
      const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
      const decryptTransform = createDecryptStream(false);
      const decryptedStream = nodeStream.pipe(decryptTransform);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
    }

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        ...userContentSecurityHeaders(contentType),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": originalFileSize.toString(),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    agentLog.error({ err: error }, "Agent download error");
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
