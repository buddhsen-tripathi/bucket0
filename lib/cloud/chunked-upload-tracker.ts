/** Shared multipart state. Quota changes and their reservation commit together. */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/shared/db";
import { systemStorage } from "@/lib/cloud/system-service";
import { cloudLog } from "@/lib/shared/logger";
import { cloudCatalog } from "@/lib/cloud/catalog-service";

export const DEFAULT_STALE_THRESHOLD_MS = 60 * 60 * 1000;

export type UploadRow = {
  id: string; user_id: string; file_key: string; upload_id: string | null;
  size: string | number; content_type: string; encrypted: boolean;
  existing_size: string | number; is_new_file: boolean;
  reserved_bytes: string | number; reserved_files: number; state: string;
  started_at: string | Date; updated_at: string | Date; operation_token: string | null;
};
export type ChunkedUploadInfo = ReturnType<typeof uploadInfo>;
function uploadInfo(row: UploadRow) {
  return {
    id: row.id, userId: row.user_id, key: row.file_key, uploadId: row.upload_id,
    size: Number(row.size), contentType: row.content_type, encrypted: row.encrypted,
    existingSize: Number(row.existing_size), isNewFile: row.is_new_file,
    reservedBytes: Number(row.reserved_bytes), reservedFiles: row.reserved_files,
    state: row.state, startedAt: new Date(row.started_at), updatedAt: new Date(row.updated_at),
    operationToken: row.operation_token,
  };
}

type Execute = (query: SQL) => Promise<UploadRow[]>;
type UploadStorage = Pick<typeof systemStorage, "abortMultipartUpload" | "getFileMetadata">;
const execute: Execute = async (query) => (await db.execute<UploadRow>(query)).rows;

export function createChunkedUploadTracker(run: Execute = execute, storage: UploadStorage = systemStorage) {
  async function abortMultipart(userId: string, key: string, uploadId: string) {
    try {
      await storage.abortMultipartUpload(userId, key, uploadId);
    } catch (error) {
      // A previous abort may have succeeded before its response/DB commit was lost.
      if (!(error instanceof Error) || error.name !== "NoSuchUpload") throw error;
    }
  }
  async function getUpload(userId: string, uploadId: string) {
    const [row] = await run(sql`SELECT * FROM chunked_uploads WHERE user_id = ${userId} AND upload_id = ${uploadId}`);
    return row ? uploadInfo(row) : undefined;
  }

  async function releaseReservation(id: string) {
    // DELETE RETURNING makes rollback idempotent, including concurrent cleanup.
    await run(sql`WITH removed AS (
      DELETE FROM chunked_uploads WHERE id = ${id} AND state = 'aborting' RETURNING *
    ) UPDATE users SET
      storage_usage = GREATEST(0, users.storage_usage - removed.reserved_bytes),
      file_count = GREATEST(0, users.file_count - removed.reserved_files), updated_at = now()
      FROM removed WHERE users.id = removed.user_id RETURNING removed.*`);
  }

  async function abortReservation(id: string, userId: string) {
    const [row] = await run(sql`UPDATE chunked_uploads SET state = 'aborting', updated_at = now()
      WHERE id = ${id} AND user_id = ${userId} AND state IN ('pending', 'reserved', 'active', 'aborting')
      RETURNING *`);
    if (!row) return false;
    if (row.upload_id) await abortMultipart(userId, row.file_key, row.upload_id);
    await releaseReservation(id);
    return true;
  }

  async function completeUpload(userId: string, uploadId: string) {
    // Metadata, shrink adjustment, and removal of the reservation commit together.
    await run(sql`WITH finished AS (
      DELETE FROM chunked_uploads WHERE user_id = ${userId} AND upload_id = ${uploadId}
        AND state = 'completing' RETURNING *
    ), saved AS (
      INSERT INTO cloud_files (id, user_id, file_key, file_name, file_size, mime_type,
        encrypted, encryption_mode, iv, auth_tag, thumbnail_key, folder_path, updated_at)
      SELECT COALESCE((SELECT id FROM cloud_files WHERE user_id = finished.user_id
        AND file_key = 'users/' || finished.user_id || '/' || finished.file_key LIMIT 1), finished.id),
        finished.user_id, 'users/' || finished.user_id || '/' || finished.file_key, finished.file_key,
        finished.size, finished.content_type, finished.encrypted,
        CASE WHEN finished.encrypted THEN 'chunked_gcm_mp' ELSE 'none' END,
        '00000000000000000000000000000000', NULL, NULL,
        regexp_replace(finished.file_key, '[^/]+$', ''), now() FROM finished
      ON CONFLICT (id) DO UPDATE SET file_size = EXCLUDED.file_size, mime_type = EXCLUDED.mime_type,
        encrypted = EXCLUDED.encrypted, encryption_mode = EXCLUDED.encryption_mode,
        iv = EXCLUDED.iv, auth_tag = NULL, thumbnail_key = NULL, thumbnail_attempted = false,
        is_agent_upload = false, uploaded_via = NULL,
        folder_path = EXCLUDED.folder_path, updated_at = now()
      RETURNING id
    ) UPDATE users SET storage_usage = GREATEST(0, users.storage_usage -
        GREATEST(finished.existing_size - finished.size, 0)), updated_at = now()
      FROM finished WHERE users.id = finished.user_id RETURNING finished.*`);
  }

  async function objectWasCompleted(info: ChunkedUploadInfo) {
    // Distinguish this completed multipart object from an older overwritten file.
    const metadata = await storage.getFileMetadata(info.userId, info.key);
    return metadata?.Metadata?.["upload-token"] === info.id;
  }

  return {
    getUpload,
    completeUpload,
    async reserveUpload(args: { userId: string; key: string; size: number; contentType: string;
      encrypted: boolean; maxStorageBytes: number; maxFileCount: number }) {
      // Drive uploads never overwrite an Agent Storage file at the same key.
      const [agentFile] = await run(sql`SELECT id FROM cloud_files WHERE user_id = ${args.userId}
        AND file_key = ${`users/${args.userId}/${args.key}`} AND is_agent_upload LIMIT 1`);
      if (agentFile) return { success: false as const, reason: "surface" as const };
      const id = crypto.randomUUID();
      const [slot] = await run(sql`INSERT INTO chunked_uploads
        (id, user_id, file_key, size, content_type, encrypted)
        VALUES (${id}, ${args.userId}, ${args.key}, ${args.size}, ${args.contentType}, ${args.encrypted})
        ON CONFLICT (user_id, file_key) DO NOTHING RETURNING *`);
      if (!slot) return { success: false as const, reason: "conflict" as const };
      // Lock the reservation against cleanup; guard both user limits atomically.
      const [reserved] = await run(sql`WITH locked AS (
        SELECT u.*, f.file_size AS prior_size, f.id IS NULL AS new_file FROM chunked_uploads u
        LEFT JOIN LATERAL (SELECT id, file_size FROM cloud_files WHERE user_id = u.user_id
          AND file_key = 'users/' || u.user_id || '/' || u.file_key LIMIT 1) f ON true
        WHERE u.id = ${id} AND u.state = 'pending' FOR UPDATE OF u
      ), charged AS (
        UPDATE users SET storage_usage = users.storage_usage + GREATEST(locked.size - COALESCE(locked.prior_size, 0), 0),
          file_count = users.file_count + CASE WHEN locked.new_file THEN 1 ELSE 0 END, updated_at = now()
        FROM locked WHERE users.id = locked.user_id
          AND users.storage_usage + GREATEST(locked.size - COALESCE(locked.prior_size, 0), 0) <= ${args.maxStorageBytes}
          AND (${args.maxFileCount} <= 0 OR users.file_count + CASE WHEN locked.new_file THEN 1 ELSE 0 END <= ${args.maxFileCount})
        RETURNING locked.id, COALESCE(locked.prior_size, 0) AS prior_size, locked.new_file
      ) UPDATE chunked_uploads u SET state = 'reserved', existing_size = charged.prior_size,
        is_new_file = charged.new_file, reserved_bytes = GREATEST(u.size - charged.prior_size, 0),
        reserved_files = CASE WHEN charged.new_file THEN 1 ELSE 0 END, updated_at = now()
        FROM charged WHERE u.id = charged.id RETURNING u.*`);
      if (!reserved) {
        await run(sql`DELETE FROM chunked_uploads WHERE id = ${id} AND state = 'pending' RETURNING *`);
        return { success: false as const, reason: "quota" as const };
      }
      return { success: true as const, upload: uploadInfo(reserved) };
    },
    async activateUpload(id: string, userId: string, uploadId: string) {
      const [row] = await run(sql`UPDATE chunked_uploads SET upload_id = ${uploadId}, state = 'active', updated_at = now()
        WHERE id = ${id} AND user_id = ${userId} AND state = 'reserved' RETURNING *`);
      if (!row) throw new Error("Upload reservation is no longer available");
    },
    abortReservation,
    async abortUpload(userId: string, uploadId: string, key: string) {
      const info = await getUpload(userId, uploadId);
      if (!info) return true;
      if (info.key !== key) return false;
      return abortReservation(info.id, userId);
    },
    async startCompletion(userId: string, uploadId: string, key: string) {
      const operationToken = crypto.randomUUID();
      const [row] = await run(sql`UPDATE chunked_uploads SET state = 'completing',
        operation_token = ${operationToken}, updated_at = now()
        WHERE user_id = ${userId} AND upload_id = ${uploadId} AND file_key = ${key}
          AND (state = 'active' OR (state = 'completing' AND updated_at < now() - interval '5 minutes'))
        RETURNING *`);
      return row ? uploadInfo(row) : undefined;
    },
    async resumeUpload(userId: string, uploadId: string, operationToken: string | null) {
      if (!operationToken) return;
      await run(sql`UPDATE chunked_uploads SET state = 'active', operation_token = NULL, updated_at = now()
        WHERE user_id = ${userId} AND upload_id = ${uploadId} AND state = 'completing'
          AND operation_token = ${operationToken} RETURNING *`);
    },
    objectWasCompleted,
    async touchUpload(userId: string, uploadId: string) {
      const [row] = await run(sql`UPDATE chunked_uploads SET updated_at = now()
        WHERE user_id = ${userId} AND upload_id = ${uploadId} AND state = 'active' RETURNING *`);
      return row ? uploadInfo(row) : undefined;
    },
    async getStaleUploads(userId: string, thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
      const rows = await run(sql`SELECT * FROM chunked_uploads WHERE user_id = ${userId}
        AND updated_at < ${new Date(Date.now() - thresholdMs)} ORDER BY updated_at LIMIT 100`);
      return rows.map(uploadInfo);
    },
    async cleanupStaleUploads(userId: string, thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
      const rows = await run(sql`SELECT * FROM chunked_uploads WHERE user_id = ${userId}
        AND updated_at < ${new Date(Date.now() - thresholdMs)} ORDER BY updated_at LIMIT 100`);
      let cleaned = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          const info = uploadInfo(row);
          if (info.state === "completing") {
            // Never roll back quota for an object whose completion response was lost.
            if (!(await objectWasCompleted(info)) || !info.uploadId) { failed++; continue; }
            await completeUpload(userId, info.uploadId);
            await cloudCatalog.onFileWritten(userId, `users/${userId}/${info.key}`, { isAgentUpload: false })
              .catch((error) => cloudLog.error({ err: error }, "Recovered upload folder sync failed"));
            cleaned++;
          } else {
            // Recheck staleness: a part may have refreshed the lease since SELECT.
            const [claimed] = await run(sql`UPDATE chunked_uploads SET state = 'aborting', updated_at = now()
              WHERE id = ${info.id} AND state IN ('pending', 'reserved', 'active', 'aborting')
                AND updated_at < ${new Date(Date.now() - thresholdMs)} RETURNING *`);
            if (!claimed) continue;
            if (claimed.upload_id) await abortMultipart(userId, claimed.file_key, claimed.upload_id);
            await releaseReservation(info.id);
            cleaned++;
          }
        } catch (error) {
          failed++;
          cloudLog.error({ err: error }, "Failed to clean up multipart reservation");
        }
      }
      return { cleaned, failed, total: rows.length };
    },
    async getStats(userId: string) {
      const rows = await run(sql`SELECT * FROM chunked_uploads WHERE user_id = ${userId}`);
      return {
        activeCount: rows.length,
        totalReservedBytes: rows.reduce((total, row) => total + Number(row.reserved_bytes), 0),
        oldestUploadAge: rows.length ? Math.max(...rows.map((row) => Date.now() - new Date(row.started_at).getTime())) : null,
      };
    },
  };
}

export const chunkedUploadTracker = createChunkedUploadTracker();
