import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { teamShareLinks, teamFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { systemStorage } from "@/lib/cloud/system-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { Readable } from "stream";
import { parseRange, getContentTypeFromExtension, getClientIp } from "@/lib/shared/http-utils";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { teamLog } from "@/lib/shared/logger";

// Server-proxied file streaming for team share links with chunking support
export async function GET(request: NextRequest) {
  try {
    // IP-based rate limiting for public share endpoints
    const ip = getClientIp(request);
    const rateLimitResult = await RateLimiters.shareStream(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("id");
    const download = searchParams.get("download") === "true";

    if (!linkId) {
      return NextResponse.json({ error: "Link ID required" }, { status: 400 });
    }

    // Look up the team share link
    const [shareLink] = await db
      .select()
      .from(teamShareLinks)
      .where(
        and(
          eq(teamShareLinks.id, linkId),
          eq(teamShareLinks.isActive, true)
        )
      )
      .limit(1);

    if (!shareLink) {
      return NextResponse.json({ error: "Link not found or revoked" }, { status: 404 });
    }

    // Check access type for protected links
    if (shareLink.accessType === "protected") {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    // Reconstruct full file key (teamFiles stores full path: teams/{teamId}/{filename})
    const fullFileKey = shareLink.fileKey.startsWith("teams/")
      ? shareLink.fileKey
      : `teams/${shareLink.teamId}/${shareLink.fileKey}`;

    // Get file metadata from database for encryption info
    const [fileRecord] = await db
      .select()
      .from(teamFiles)
      .where(
        and(
          eq(teamFiles.teamId, shareLink.teamId),
          eq(teamFiles.fileKey, fullFileKey)
        )
      )
      .limit(1);

    if (!fileRecord) {
      return NextResponse.json({ error: "File metadata not found" }, { status: 404 });
    }

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode } = fileRecord;

    // Check for Range header (use original file size for range validation)
    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, Number(originalFileSize));

    // Determine R2 fetch strategy
    let r2Range: string | undefined;
    let encryptedRange: ReturnType<typeof getEncryptedRangeForPlaintextRange> = null;

    if (!encrypted || encryptionMode === "none") {
      r2Range = range ? `bytes=${range.start}-${range.end}` : undefined;
    } else if (range) {
      encryptedRange = getEncryptedRangeForPlaintextRange(range.start, range.end, encryptionMode);
      r2Range = encryptedRange?.r2Range;
    }

    const response = await systemStorage.getTeamFileStream(
      shareLink.teamId,
      shareLink.fileKey,
      r2Range
    );

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Prefer extension-based type if DB has generic octet-stream (common for .md, .ts, .go, etc.)
    const extensionType = getContentTypeFromExtension(shareLink.fileKey);
    const contentType = (!mimeType || mimeType === "application/octet-stream")
      ? extensionType
      : (mimeType || response.ContentType || extensionType);
    const disposition = download ? "attachment" : "inline";

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === 'none') {
      // File is not encrypted - stream directly
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
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(shareLink.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
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

    // Full file request (200 OK) - use original file size
    headers["Content-Length"] = originalFileSize.toString();

    return new NextResponse(webStream, { headers });

  } catch (error) {
    teamLog.error({ err: error }, "Share stream error");
    return NextResponse.json(
      { error: "Failed to stream file" },
      { status: 500 }
    );
  }
}
