import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { systemStorage } from "@/lib/cloud/system-service";
import { requireAuth, requireTeamPermission } from "@/lib/teams/route-helpers";
import { Permission } from "@/lib/teams/permission-service";
import { teamLog } from "@/lib/shared/logger";


interface RouteParams {
  params: Promise<{ teamId: string }>;
}

/**
 * Create a folder in team storage.
 * Folders are represented as 0-byte objects with a trailing slash.
 * They are NOT encrypted since they contain no data.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;
    const { userId } = authResult;

    const { teamId } = await params;

    // Check upload permission
    const permResult = await requireTeamPermission(teamId, userId, Permission.UPLOAD);
    if (permResult) return permResult;

    const body = await request.json();
    const { folderPath } = body;

    if (!folderPath || typeof folderPath !== "string") {
      return NextResponse.json(
        { error: "Folder path is required" },
        { status: 400 }
      );
    }

    // Security: block path traversal attempts
    if (folderPath.includes("..") || folderPath.includes("//")) {
      return NextResponse.json(
        { error: "Invalid folder path" },
        { status: 400 }
      );
    }

    // Sanitize: remove any leading slashes and special chars (except allowed ones)
    // IMPORTANT: Must match sanitizeFilename() in upload-validation.ts to prevent
    // folder name mismatch between folder creation and file uploads
    const sanitizedPath = folderPath
      .replace(/^\/+/, "") // Remove leading slashes
      .replace(/[^a-zA-Z0-9._\-\/]/g, "_"); // Replace special chars (NO spaces - must match upload sanitization)

    // Ensure folder path ends with a slash
    const normalizedPath = sanitizedPath.endsWith("/") ? sanitizedPath : `${sanitizedPath}/`;

    // Create an empty object with the folder path
    await systemStorage.uploadTeamFile(
      teamId,
      normalizedPath,
      Buffer.alloc(0), // Empty buffer - 0 bytes
      "application/x-directory"
    );

    teamLog.info("Team folder created");

    return NextResponse.json({ success: true, key: normalizedPath });
  } catch (error) {
    teamLog.error({ err: error }, "Folder creation error");
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
