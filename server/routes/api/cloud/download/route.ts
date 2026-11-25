import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Readable } from "stream";
import { parseRange } from "@/lib/shared/http-utils";
import { cloudLog } from "@/lib/shared/logger";

// Server-proxied download - streams file through our server
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Return our own download endpoint URL (server-proxied)
    const downloadUrl = `/api/cloud/download?key=${encodeURIComponent(key)}`;
    return NextResponse.json({ downloadUrl });
  } catch (error) {
    cloudLog.error({ err: error }, "Cloud download error");
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 }
    );
  }
}

// GET endpoint for streaming the actual file download with chunking support
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!key) {
      return NextResponse.json({ error: "File key required" }, { status: 400 });
    }

    // Get file size first to validate range requests
    const fileSize = await systemStorage.getFileSize(userId, key);
    if (fileSize === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Check for Range header
    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, fileSize);

    // Get encryption metadata from database
    const fileRecord = await db.select()
      .from(cloudFiles)
      .where(and(
        eq(cloudFiles.userId, userId),
        eq(cloudFiles.fileKey, `users/${userId}/${key}`)
      ))
      .limit(1);

    if (fileRecord.length === 0) {
      return NextResponse.json({ error: "File metadata not found" }, { status: 404 });
    }

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode } = fileRecord[0];

    const contentType = mimeType || "application/octet-stream";
    const fileName = key.split("/").pop() || key;

    // Determine if we can use range requests based on encryption mode
    // - none: supports range requests
    // - chunked_gcm: NO range support for now (would need chunk-aligned ranges)
    const supportsRangeRequest = !encrypted || encryptionMode === 'none';
    const shouldFetchRange = supportsRangeRequest && range;

    const response = await systemStorage.getFileStream(
      userId,
      key,
      shouldFetchRange ? `bytes=${range.start}-${range.end}` : undefined
    );

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === 'none') {
      // File is not encrypted - stream directly
      webStream = response.Body.transformToWebStream();
    } else if (encryptionMode === 'chunked_gcm') {
      // Chunked encryption with header - use streaming decryption
      const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
      const decryptTransform = createDecryptStream(true); // has header
      const decryptedStream = nodeStream.pipe(decryptTransform);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
    } else {
      // Chunked encryption from multipart upload (no header)
      const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
      const decryptTransform = createDecryptStream(false); // no header
      const decryptedStream = nodeStream.pipe(decryptTransform);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
    }

    const headers: Record<string, string> = {
      ...userContentSecurityHeaders(contentType),
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-cache",
      "Accept-Ranges": supportsRangeRequest ? "bytes" : "none",
    };

    // Handle range request (206 Partial Content) - only for unencrypted files
    if (shouldFetchRange && range) {
      const contentLength = (range.end - range.start) + 1;
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${Number(originalFileSize)}`;
      headers["Content-Length"] = contentLength.toString();

      return new NextResponse(webStream, {
        status: 206,
        headers,
      });
    }

    // Full file request (200 OK)
    // Use original file size from database (decrypted size)
    headers["Content-Length"] = originalFileSize.toString();

    return new NextResponse(webStream, { headers });

  } catch (error) {
    cloudLog.error({ err: error }, "Download stream error");
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
