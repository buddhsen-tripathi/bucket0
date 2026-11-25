/**
 * S3 API Files Download - Web UI endpoint
 * Uses Clerk session auth
 *
 * GET /api/s3-api/files/download?bucket=xxx&key=xxx
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { Readable } from "stream";
import { s3ApiBucketService, s3ApiStorageService } from "@/lib/s3-api";
import { s3ApiLog } from "@/lib/shared/logger";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = request.nextUrl.searchParams.get("bucket");
  const key = request.nextUrl.searchParams.get("key");
  const inline = request.nextUrl.searchParams.get("inline") === "true";

  if (!bucketName || !key) {
    return NextResponse.json({ error: "Bucket and key are required" }, { status: 400 });
  }

  // Verify bucket exists and belongs to user
  const bucket = await s3ApiBucketService.getBucket(userId, bucketName);
  if (!bucket) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  try {
    const range = request.headers.get("range") || undefined;
    const result = await s3ApiStorageService.getObject(userId, bucketName, key, range);

    if (!result) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileName = key.split("/").pop() || key;
    const disposition = inline ? "inline" : `attachment; filename="${fileName}"`;

    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Content-Length": String(result.contentLength),
      "Content-Disposition": disposition,
      ...userContentSecurityHeaders(result.contentType),
      "ETag": result.etag,
      "Last-Modified": result.lastModified.toUTCString(),
      "Accept-Ranges": "bytes",
    };

    if (result.contentRange) {
      headers["Content-Range"] = result.contentRange;
    }

    // Convert Node.js Readable to Web ReadableStream
    const webStream = Readable.toWeb(result.body) as ReadableStream;

    return new Response(webStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error downloading file");
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
