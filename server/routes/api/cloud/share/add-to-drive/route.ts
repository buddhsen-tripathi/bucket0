import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { shareLinks, teamShareLinks, cloudFiles, teamFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { systemStorage } from "@/lib/cloud/system-service";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits } from "@/lib/payments/plans";
import { createDecryptStream, createEncryptStream } from "@/lib/cloud/encryption-service";
import { Readable } from "stream";
import { sanitizeFilename } from "@/lib/cloud/upload-validation";
import { shouldSkipEncryption } from "@/lib/shared/encryption-utils";
import { cloudLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";


/**
 * POST - Copy a shared file to the authenticated user's personal cloud storage
 */
export async function POST(request: NextRequest) {
  // Set while a quota reservation is held but the file row is not yet committed.
  let releaseReservation: (() => Promise<void>) | null = null;
  try {
    // Auth check
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const { shareLinkId, shareType } = await request.json();

    if (!shareLinkId || !shareType) {
      return NextResponse.json(
        { error: "Share link ID and type required" },
        { status: 400 }
      );
    }

    // Get the share link based on type
    let sourceFile: {
      fileKey: string;
      fileName: string;
      fileSize: number;
      mimeType: string | null;
      encrypted: boolean;
      encryptionMode: string;
      ownerId: string; // userId for personal, teamId for team
    } | null = null;

    if (shareType === "personal") {
      // Get personal share link
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(and(eq(shareLinks.id, shareLinkId), eq(shareLinks.isActive, true)))
        .limit(1);

      if (!link) {
        return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
      }

      // Check if add-to-drive is allowed
      if (!link.allowAddToDrive) {
        return NextResponse.json(
          { error: "Saving to drive is not allowed for this file" },
          { status: 403 }
        );
      }

      // Don't allow users to copy their own files
      if (link.userId === userId) {
        return NextResponse.json(
          { error: "You already own this file" },
          { status: 400 }
        );
      }

      // Get the file metadata
      const fullFileKey = `users/${link.userId}/${link.fileKey}`;
      const [fileRecord] = await db
        .select()
        .from(cloudFiles)
        .where(eq(cloudFiles.fileKey, fullFileKey))
        .limit(1);

      if (!fileRecord) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      sourceFile = {
        fileKey: link.fileKey,
        fileName: link.fileName,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
        encrypted: fileRecord.encrypted,
        encryptionMode: fileRecord.encryptionMode,
        ownerId: link.userId,
      };
    } else if (shareType === "team") {
      // Get team share link
      const [link] = await db
        .select()
        .from(teamShareLinks)
        .where(and(eq(teamShareLinks.id, shareLinkId), eq(teamShareLinks.isActive, true)))
        .limit(1);

      if (!link) {
        return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
      }

      // Check if add-to-drive is allowed
      if (!link.allowAddToDrive) {
        return NextResponse.json(
          { error: "Saving to drive is not allowed for this file" },
          { status: 403 }
        );
      }

      // Get the file metadata
      const fullFileKey = link.fileKey.startsWith("teams/")
        ? link.fileKey
        : `teams/${link.teamId}/${link.fileKey}`;

      const [fileRecord] = await db
        .select()
        .from(teamFiles)
        .where(
          and(
            eq(teamFiles.teamId, link.teamId),
            eq(teamFiles.fileKey, fullFileKey)
          )
        )
        .limit(1);

      if (!fileRecord) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      sourceFile = {
        fileKey: link.fileKey,
        fileName: link.fileName,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
        encrypted: fileRecord.encrypted,
        encryptionMode: fileRecord.encryptionMode,
        ownerId: link.teamId, // For teams, we use teamId
      };
    } else {
      return NextResponse.json({ error: "Invalid share type" }, { status: 400 });
    }

    if (!sourceFile) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Check if user already saved this share link
    const [existingSave] = await db
      .select({ id: cloudFiles.id, fileName: cloudFiles.fileName })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.sourceShareLinkId, shareLinkId),
          eq(cloudFiles.sourceShareType, shareType)
        )
      )
      .limit(1);

    if (existingSave) {
      return NextResponse.json(
        {
          error: "Already saved",
          message: "You have already saved this file to your drive",
          existingFile: existingSave.fileName
        },
        { status: 409 }
      );
    }

    const dbUser = await dbService.getUser(userId, email);
    const limits = getPlanLimits(dbUser.plan);

    // Generate unique filename if needed
    let targetFilename = sanitizeFilename(sourceFile.fileName);
    const existingFile = await db
      .select()
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, userId),
          eq(cloudFiles.fileKey, `users/${userId}/${targetFilename}`)
        )
      )
      .limit(1);

    if (existingFile.length > 0) {
      // Add timestamp to make unique
      const ext = targetFilename.includes(".") ? `.${targetFilename.split(".").pop()}` : "";
      const baseName = targetFilename.replace(ext, "");
      targetFilename = `${baseName}_${Date.now()}${ext}`;
    }

    // Reserve quota atomically before copying; released if the copy or insert fails
    const newFileKey = `users/${userId}/${targetFilename}`;
    const reservation = await dbService.reserveQuotaAtomic(
      userId,
      newFileKey,
      sourceFile.fileSize,
      limits.maxStorageBytes
    );
    if (!reservation.success) {
      const remainingStorage = Math.max(0, limits.maxStorageBytes - dbUser.storageUsage);
      return NextResponse.json(
        {
          error: "Insufficient storage space",
          details: {
            fileSize: sourceFile.fileSize,
            remainingStorage,
            storageLimit: limits.maxStorageBytes,
          },
        },
        { status: 403 }
      );
    }

    // Give back exactly what the reservation charged (nothing if the key already had a row of equal or larger size)
    const chargedBytes = reservation.isNewFile
      ? sourceFile.fileSize
      : Math.max(0, sourceFile.fileSize - reservation.existingSize);
    const chargedFiles = reservation.isNewFile ? 1 : 0;
    releaseReservation = async () => {
      if (chargedBytes > 0 || chargedFiles > 0) await dbService.decrementUsage(userId, chargedBytes, chargedFiles);
    };

    // Get source file stream
    let response;
    if (shareType === "personal") {
      response = await systemStorage.getFileStream(sourceFile.ownerId, sourceFile.fileKey);
    } else {
      response = await systemStorage.getTeamFileStream(sourceFile.ownerId, sourceFile.fileKey);
    }

    if (!response.Body) {
      await releaseReservation();
      return NextResponse.json({ error: "Failed to read source file" }, { status: 500 });
    }

    // Determine if target file should skip encryption
    const mimeType = sourceFile.mimeType || "application/octet-stream";
    const targetSkipEncryption = shouldSkipEncryption(targetFilename, mimeType);
    const targetEncryptionMode = targetSkipEncryption ? "none" : "chunked_gcm";

    // Process the file: stream decrypt → re-encrypt → upload (avoids buffering entire file)
    const webStream = response.Body.transformToWebStream();
    const nodeStream = Readable.fromWeb(webStream as import("stream/web").ReadableStream);

    let uploadStream: Readable;

    if (!sourceFile.encrypted || sourceFile.encryptionMode === "none") {
      // Source is not encrypted
      if (targetSkipEncryption) {
        uploadStream = nodeStream;
      } else {
        uploadStream = nodeStream.pipe(createEncryptStream());
      }
    } else {
      // Chunked encryption - streaming decrypt → optional re-encrypt
      const hasHeader = sourceFile.encryptionMode === "chunked_gcm";
      const decryptedStream = nodeStream.pipe(createDecryptStream(hasHeader));
      if (targetSkipEncryption) {
        uploadStream = decryptedStream;
      } else {
        uploadStream = decryptedStream.pipe(createEncryptStream());
      }
    }

    // Stream upload to user's storage
    await systemStorage.uploadFileStream(userId, targetFilename, uploadStream, mimeType);

    // Create file record in database with source tracking.
    // The unique (user, share link) index makes a concurrent second save insert nothing.
    const inserted = await db.insert(cloudFiles).values({
      userId,
      fileKey: newFileKey,
      fileName: targetFilename,
      fileSize: sourceFile.fileSize, // Original size
      mimeType,
      encrypted: !targetSkipEncryption,
      encryptionMode: targetEncryptionMode,
      iv: "00000000000000000000000000000000", // Chunked encryption embeds IV
      authTag: null,
      thumbnailKey: null,
      thumbnailAttempted: false,
      folderPath: cloudCatalog.deriveFolderPath(userId, newFileKey),
      sourceShareLinkId: shareLinkId, // Track source for duplicate prevention
      sourceShareType: shareType,
    }).onConflictDoNothing().returning({ id: cloudFiles.id });

    if (inserted.length === 0) {
      // Lost a race with another save of this link. Remove our copy unless it landed on the winner's key.
      await releaseReservation();
      releaseReservation = null;
      const [winner] = await db
        .select({ fileKey: cloudFiles.fileKey, fileName: cloudFiles.fileName })
        .from(cloudFiles)
        .where(
          and(
            eq(cloudFiles.userId, userId),
            eq(cloudFiles.sourceShareLinkId, shareLinkId),
            eq(cloudFiles.sourceShareType, shareType)
          )
        )
        .limit(1);
      if (winner?.fileKey !== newFileKey) {
        await systemStorage.deleteFile(userId, targetFilename).catch((err) =>
          cloudLog.error({ err }, "Failed to remove duplicate add-to-drive copy")
        );
      }
      return NextResponse.json(
        {
          error: "Already saved",
          message: "You have already saved this file to your drive",
          existingFile: winner?.fileName,
        },
        { status: 409 }
      );
    }
    releaseReservation = null;
    await cloudCatalog
      .onFileWritten(userId, newFileKey, { isAgentUpload: false })
      .catch((err) => cloudLog.error({ err }, "catalog folder sync failed"));

    cloudLog.info("File added to drive from share");
    return NextResponse.json({
      success: true,
      fileName: targetFilename,
      fileKey: newFileKey,
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Add to drive error");
    await releaseReservation?.();
    return NextResponse.json(
      { error: "Failed to save file to your drive" },
      { status: 500 }
    );
  }
}
