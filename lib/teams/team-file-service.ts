import { deleteGeneratedThumbnails } from "@/lib/cloud/thumbnail-storage";
/**
 * Team File Service
 * Centralizes all teamFiles DB operations
 */

import { db } from "@/lib/shared/db";
import { teamFiles } from "@/db/schema";
import { eq, and, like, desc, asc, sql } from "drizzle-orm";

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class TeamFileService {
  /**
   * Get a single file by teamId and fileKey
   */
  async getFile(teamId: string, fileKey: string) {
    const [file] = await db
      .select()
      .from(teamFiles)
      .where(and(eq(teamFiles.teamId, teamId), eq(teamFiles.fileKey, fileKey)))
      .limit(1);

    return file ?? null;
  }

  /**
   * List files for a team (paginated, sorted)
   */
  async listFiles(
    teamId: string,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: string;
    } = {}
  ) {
    const { limit = 50, offset = 0, sortBy = "createdAt", sortOrder = "desc" } = options;

    const orderByColumn =
      sortBy === "name"
        ? teamFiles.fileName
        : sortBy === "size"
          ? teamFiles.fileSize
          : teamFiles.createdAt;

    const orderBy = sortOrder === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    const files = await db
      .select({
        id: teamFiles.id,
        fileName: teamFiles.fileName,
        fileSize: teamFiles.fileSize,
        mimeType: teamFiles.mimeType,
        fileKey: teamFiles.fileKey,
        thumbnailKey: teamFiles.thumbnailKey,
        isStarred: teamFiles.isStarred,
        uploadedBy: teamFiles.uploadedBy,
        createdAt: teamFiles.createdAt,
        updatedAt: teamFiles.updatedAt,
      })
      .from(teamFiles)
      .where(eq(teamFiles.teamId, teamId))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(teamFiles)
      .where(eq(teamFiles.teamId, teamId));

    return { files, total: countResult?.count ?? 0 };
  }

  /**
   * Save file metadata (insert or update atomically using ON CONFLICT)
   */
  async saveFileMetadata(params: {
    teamId: string;
    uploadedBy: string;
    fileName: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
    encryptionMode: "chunked_gcm" | "none";
  }) {
    const { teamId, uploadedBy, fileName, fileKey, fileSize, mimeType, encryptionMode } = params;

    const result = await db
      .insert(teamFiles)
      .values({
        teamId,
        uploadedBy,
        fileKey,
        fileName,
        fileSize,
        mimeType,
        encrypted: encryptionMode === "chunked_gcm",
        encryptionMode,
        iv: "00000000000000000000000000000000",
        authTag: null,
        thumbnailKey: null,
      })
      .onConflictDoUpdate({
        target: [teamFiles.teamId, teamFiles.fileKey],
        set: {
          fileSize,
          mimeType,
          encrypted: encryptionMode === "chunked_gcm",
          encryptionMode,
          iv: "00000000000000000000000000000000",
          authTag: null,
          thumbnailKey: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: teamFiles.id, createdAt: teamFiles.createdAt, updatedAt: teamFiles.updatedAt });

    // If createdAt equals updatedAt (within ~1s), it's a new insert
    const row = result[0];
    const isNewFile = row
      ? Math.abs(new Date(row.createdAt).getTime() - new Date(row.updatedAt).getTime()) < 1000
      : true;

    return { isNewFile };
  }

  /**
   * Delete a single file record
   */
  async deleteFile(teamId: string, fileKey: string) {
    const deleted = await db
      .delete(teamFiles)
      .where(and(eq(teamFiles.teamId, teamId), eq(teamFiles.fileKey, fileKey))).returning({ id: teamFiles.id });
    await deleteGeneratedThumbnails("team", teamId, deleted.map((file) => file.id));
  }

  /**
   * Delete all file records matching a prefix (folder delete)
   */
  async deleteFilesByPrefix(teamId: string, prefix: string) {
    const files = await db
      .select({ id: teamFiles.id, fileSize: teamFiles.fileSize })
      .from(teamFiles)
      .where(
        and(eq(teamFiles.teamId, teamId), like(teamFiles.fileKey, `${escapeLikePattern(prefix)}%`))
      );

    const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);
    const count = files.length;

    await db
      .delete(teamFiles)
      .where(
        and(eq(teamFiles.teamId, teamId), like(teamFiles.fileKey, `${escapeLikePattern(prefix)}%`))
      );

    await deleteGeneratedThumbnails("team", teamId, files.map((file) => file.id));
    return { totalSize, count };
  }

  /**
   * Delete all files for a team (used in team deletion)
   */
  async deleteAllForTeam(teamId: string) {
    await db.delete(teamFiles).where(eq(teamFiles.teamId, teamId));
    await deleteGeneratedThumbnails("team", teamId);
  }
}

export const teamFileService = new TeamFileService();
