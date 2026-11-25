import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { systemStorage } from "@/lib/cloud/system-service";
import { Permission } from "@/lib/teams/permission-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { Readable } from "stream";
import { parseRange, getContentTypeFromExtension } from "@/lib/shared/http-utils";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamFileService } from "@/lib/teams/team-file-service";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

// GET endpoint for inline file viewing
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

    // Check download permission (viewing requires download permission)
    const permError = await requireTeamPermission(teamId, userId, Permission.DOWNLOAD);
    if (permError) return permError;

    // Get file metadata from database
    const fullKey = `teams/${teamId}/${key}`;
    const fileRecord = await teamFileService.getFile(teamId, fullKey);

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode, updatedAt } = fileRecord;

    // ETag / conditional request support
    const etag = `"${Buffer.from(`${key}:${updatedAt.getTime()}`).toString("base64url")}"`;
    const ifNoneMatch = request.headers.get("if-none-match");
    const ifModifiedSince = request.headers.get("if-modified-since");

    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }
    if (ifModifiedSince && new Date(ifModifiedSince) >= updatedAt) {
      return new NextResponse(null, { status: 304 });
    }

    // Check for Range header
    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, Number(originalFileSize));

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
      r2Range = range ? `bytes=${range.start}-${range.end}` : undefined;
    } else if (range) {
      encryptedRange = getEncryptedRangeForPlaintextRange(range.start, range.end, encryptionMode);
      r2Range = encryptedRange?.r2Range;
    }

    const response = await systemStorage.getTeamFileStream(teamId, key, r2Range);

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === 'none') {
      webStream = response.Body.transformToWebStream();
    } else {
      const hasHeader = encryptionMode === 'chunked_gcm';

      if (range && encryptedRange) {
        // Partial fetch: decrypt only the fetched chunks, then slice
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
          teamLog.error({ err: decryptError }, "Decryption error");
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
        // Full file
        const nodeStream = Readable.fromWeb(response.Body.transformToWebStream() as import("stream/web").ReadableStream);
        const decryptTransform = createDecryptStream(hasHeader);
        const decryptedStream = nodeStream.pipe(decryptTransform);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        webStream = Readable.toWeb(decryptedStream as any) as ReadableStream;
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      ...userContentSecurityHeaders(contentType),
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "ETag": etag,
      "Last-Modified": updatedAt.toUTCString(),
    };

    // Handle range request
    if (range) {
      const contentLength = (range.end - range.start) + 1;
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${Number(originalFileSize)}`;
      headers["Content-Length"] = contentLength.toString();

      return new NextResponse(webStream, {
        status: 206,
        headers,
      });
    }

    headers["Content-Length"] = originalFileSize.toString();

    return new NextResponse(webStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    teamLog.error({ err: error }, "Error viewing file");
    return NextResponse.json(
      { error: "Failed to view file" },
      { status: 500 }
    );
  }
}
