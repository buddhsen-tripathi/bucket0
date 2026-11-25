import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { cloudLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";


/**
 * Create a folder in cloud storage.
 * Folders are represented as 0-byte objects with a trailing slash.
 * They are NOT encrypted since they contain no data.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Create an empty object with the folder path (this is how S3/R2 handles folders)
    // The key format is: users/{userId}/{folderPath}/
    await systemStorage.uploadFile(
      userId,
      normalizedPath,
      Buffer.alloc(0), // Empty buffer - 0 bytes
      "application/x-directory"
    );

    // Register the folder (and any new ancestors) in the catalog.
    await cloudCatalog
      .createFolder(userId, normalizedPath, { isAgentUpload: false })
      .catch((err) => cloudLog.error({ err }, "catalog folder sync failed"));

    cloudLog.info("Folder created");
    return NextResponse.json({ success: true, key: normalizedPath });
  } catch (error) {
    cloudLog.error({ err: error }, "Folder creation error");
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
