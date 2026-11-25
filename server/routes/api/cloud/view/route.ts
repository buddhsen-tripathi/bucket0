import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Readable } from "stream";
import { parseRange, getContentTypeFromExtension } from "@/lib/shared/http-utils";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";
import { cloudLog } from "@/lib/shared/logger";

// Server-proxied file viewing - streams file through our server with chunking support
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

    // Get encryption metadata from database first
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

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode, updatedAt } = fileRecord[0];

    // ETag / conditional request support — avoids R2 fetch if client has current version
    const etag = `"${Buffer.from(`${key}:${updatedAt.getTime()}`).toString("base64url")}"`;
    const ifNoneMatch = request.headers.get("if-none-match");
    const ifModifiedSince = request.headers.get("if-modified-since");

    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }
    if (ifModifiedSince && new Date(ifModifiedSince) >= updatedAt) {
      return new NextResponse(null, { status: 304 });
    }

    // Check for Range header (use original file size for range validation)
    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, Number(originalFileSize));

    // Determine content type
    // Prefer extension-based type if DB has generic octet-stream (common for .md, .ts, .go, etc.)
    const extensionType = getContentTypeFromExtension(key);
    const contentType = (!mimeType || mimeType === "application/octet-stream")
      ? extensionType
      : mimeType;
    const fileName = key.split("/").pop() || key;

    // Determine R2 fetch strategy
    let r2Range: string | undefined;
    let encryptedRange: ReturnType<typeof getEncryptedRangeForPlaintextRange> = null;

    if (!encrypted || encryptionMode === 'none') {
      // Unencrypted: pass range directly to R2
      r2Range = range ? `bytes=${range.start}-${range.end}` : undefined;
    } else if (range) {
      // Chunked encryption with range: fetch only the needed encrypted chunks
      encryptedRange = getEncryptedRangeForPlaintextRange(range.start, range.end, encryptionMode);
      r2Range = encryptedRange?.r2Range;
    }
    // Chunked without range: fetch full file (r2Range stays undefined)

    const response = await systemStorage.getFileStream(userId, key, r2Range);

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === 'none') {
      // File is not encrypted - stream directly
      webStream = response.Body.transformToWebStream();
    } else {
      const hasHeader = encryptionMode === 'chunked_gcm';

      if (range && encryptedRange) {
        // Partial fetch: decrypt only the fetched chunks, then slice
        // The fetched data has no header (we skipped it in the range calculation)
        const decryptTransform = createDecryptStream(false);
        const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
        const decryptedStream = nodeStream.pipe(decryptTransform);

        const chunks: Buffer[] = [];
        try {
          for await (const chunk of decryptedStream) {
            chunks.push(Buffer.from(chunk));
          }
        } catch (decryptError) {
          nodeStream.destroy();
          decryptTransform.destroy();
          cloudLog.error({ err: decryptError }, "View decryption error");
          return NextResponse.json({ error: "Failed to decrypt file" }, { status: 500 });
        }

        const decryptedBuffer = Buffer.concat(chunks);
        const slicedBuffer = decryptedBuffer.subarray(
          encryptedRange.plaintextStartOffset,
          encryptedRange.plaintextStartOffset + encryptedRange.plaintextLength
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        webStream = Readable.toWeb(Readable.from([slicedBuffer]) as any) as ReadableStream;
      } else {
        // Full file: stream decrypt as before
        const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
        const decryptTransform = createDecryptStream(hasHeader);
        const decryptedStream = nodeStream.pipe(decryptTransform);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      ...userContentSecurityHeaders(contentType),
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "ETag": etag,
      "Last-Modified": updatedAt.toUTCString(),
    };

    // Handle range request (206 Partial Content)
    if (range) {
      const contentLength = (range.end - range.start) + 1;
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${Number(originalFileSize)}`;
      headers["Content-Length"] = contentLength.toString();

      return new NextResponse(webStream, {
        status: 206,
        headers,
      });
    }

    // Full file request (200 OK)
    headers["Content-Length"] = originalFileSize.toString();

    return new NextResponse(webStream, {
      status: 200,
      headers
    });

  } catch (error) {
    cloudLog.error({ err: error }, "View error");
    return NextResponse.json(
      { error: "Failed to view file" },
      { status: 500 }
    );
  }
}
