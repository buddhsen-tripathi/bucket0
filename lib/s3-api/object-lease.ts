/**
 * Per-object lock for S3 gateway writes and deletes.
 *
 * PutObject and DeleteObject read the current object size and then change quota by the difference.
 * Holding a lease on (user, bucket, key) for that whole sequence stops concurrent requests on the
 * same key from crediting or charging the same bytes twice.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/shared/db";

/** Returns a token when the lease was taken, or null if another request holds it. */
export async function acquireObjectLease(userId: string, bucket: string, key: string): Promise<string | null> {
  const token = crypto.randomUUID();
  const result = await db.execute(sql`
    INSERT INTO s3_object_leases (user_id, bucket_name, object_key, token, expires_at)
    VALUES (${userId}, ${bucket}, ${key}, ${token}, now() + interval '120 seconds')
    ON CONFLICT (user_id, bucket_name, object_key) DO UPDATE
      SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
      WHERE s3_object_leases.expires_at < now()
    RETURNING token`);
  return result.rows.length > 0 ? token : null;
}

export async function releaseObjectLease(userId: string, bucket: string, key: string, token: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM s3_object_leases
    WHERE user_id = ${userId} AND bucket_name = ${bucket} AND object_key = ${key} AND token = ${token}`);
}

/** Batch form for bucket force-delete: returns the token and the keys whose leases were taken. */
export async function acquireObjectLeases(userId: string, bucket: string, keys: string[]): Promise<{ token: string; keys: string[] }> {
  const token = crypto.randomUUID();
  if (keys.length === 0) return { token, keys: [] };
  const result = await db.execute<{ object_key: string }>(sql`
    INSERT INTO s3_object_leases (user_id, bucket_name, object_key, token, expires_at)
    SELECT ${userId}, ${bucket}, k, ${token}, now() + interval '120 seconds'
    FROM unnest(ARRAY[${sql.join(keys.map((key) => sql`${key}`), sql`, `)}]::text[]) AS k
    ON CONFLICT (user_id, bucket_name, object_key) DO UPDATE
      SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
      WHERE s3_object_leases.expires_at < now()
    RETURNING object_key`);
  return { token, keys: result.rows.map((row) => row.object_key) };
}

export async function releaseObjectLeases(userId: string, bucket: string, token: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM s3_object_leases WHERE user_id = ${userId} AND bucket_name = ${bucket} AND token = ${token}`);
}
