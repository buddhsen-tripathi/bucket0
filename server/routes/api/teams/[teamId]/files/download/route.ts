import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";
import { systemStorage } from "@/lib/cloud/system-service";
import { Permission } from "@/lib/teams/permission-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";
import { Readable } from "stream";
import { parseRange } from "@/lib/shared/http-utils";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { teamFileService } from "@/lib/teams/team-file-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

// GET endpoint for streaming file download
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

    // Check download permission
    const permError = await requireTeamPermission(teamId, userId, Permission.DOWNLOAD);
    if (permError) return permError;

    // Get file metadata from database
    const fullKey = `teams/${teamId}/${key}`;
    const fileRecord = await teamFileService.getFile(teamId, fullKey);

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const { mimeType, fileSize: originalFileSize, encrypted, encryptionMode } = fileRecord;

    // Check for Range header
    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, Number(originalFileSize));

    const contentType = mimeType || "application/octet-stream";
    const fileName = key.split("/").pop() || key;

    // Determine if we can use range requests
    const supportsRangeRequest = !encrypted || encryptionMode === 'none';
    const shouldFetchRange = supportsRangeRequest && range;

    const response = await systemStorage.getTeamFileStream(
      teamId,
      key,
      shouldFetchRange ? `bytes=${range.start}-${range.end}` : undefined
    );

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let webStream: ReadableStream;

    if (!encrypted || encryptionMode === 'none') {
      webStream = response.Body.transformToWebStream();
    } else if (encryptionMode === 'chunked_gcm') {
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

    const headers: Record<string, string> = {
      ...userContentSecurityHeaders(contentType),
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-cache",
      "Accept-Ranges": supportsRangeRequest ? "bytes" : "none",
    };

    // Handle range request
    if (shouldFetchRange && range) {
      const contentLength = (range.end - range.start) + 1;
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${Number(originalFileSize)}`;
      headers["Content-Length"] = contentLength.toString();

      return new NextResponse(webStream, {
        status: 206,
        headers,
      });
    }

    headers["Content-Length"] = originalFileSize.toString();

    return new NextResponse(webStream, { headers });
  } catch (error) {
    teamLog.error({ err: error }, "Error downloading file");
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
