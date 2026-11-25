/**
 * S3 API Bucket Service
 *
 * Manages virtual S3 buckets for users. Buckets are stored in the s3ApiBuckets table
 * and map to the s3/{userId}/{bucketName}/ prefix in R2.
 */

import { db } from "@/lib/shared/db";
import { s3ApiBuckets, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPlanLimits } from "@/lib/payments/plans";
import { s3ApiStorageService } from "./storage-service";
import { acquireObjectLeases, releaseObjectLeases } from "./object-lease";
import { s3ApiLog } from "@/lib/shared/logger";

// S3 bucket naming rules
const BUCKET_NAME_REGEX = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const BUCKET_NAME_IP_REGEX = /^\d+\.\d+\.\d+\.\d+$/;

export interface BucketInfo {
  id: string;
  bucketName: string;
  storageUsed: number;
  objectCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBucketResult {
  success: boolean;
  bucket?: BucketInfo;
  error?: {
    code: "INVALID_NAME" | "ALREADY_EXISTS" | "PLAN_DISABLED" | "USER_NOT_FOUND" | "BUCKET_LIMIT_EXCEEDED";
    message: string;
  };
}

export class S3ApiBucketService {
  /**
   * Validate bucket name according to S3 naming rules
   */
  validateBucketName(name: string): { valid: boolean; reason?: string } {
    // Length check
    if (name.length < 3 || name.length > 63) {
      return { valid: false, reason: "Bucket name must be between 3 and 63 characters" };
    }

    // Format check
    if (!BUCKET_NAME_REGEX.test(name)) {
      return {
        valid: false,
        reason: "Bucket name must start and end with a letter or number, and can only contain lowercase letters, numbers, hyphens, and periods",
      };
    }

    // No IP address format
    if (BUCKET_NAME_IP_REGEX.test(name)) {
      return { valid: false, reason: "Bucket name cannot be formatted as an IP address" };
    }

    // No consecutive periods
    if (name.includes("..")) {
      return { valid: false, reason: "Bucket name cannot contain consecutive periods" };
    }

    // No hyphen next to period
    if (name.includes("-.") || name.includes(".-")) {
      return { valid: false, reason: "Bucket name cannot have a hyphen adjacent to a period" };
    }

    return { valid: true };
  }

  /**
   * Create a new virtual bucket
   */
  async createBucket(userId: string, bucketName: string): Promise<CreateBucketResult> {
    // Validate name
    const nameValidation = this.validateBucketName(bucketName);
    if (!nameValidation.valid) {
      return {
        success: false,
        error: {
          code: "INVALID_NAME",
          message: nameValidation.reason!,
        },
      };
    }

    // Check user exists and plan allows S3 API
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      };
    }

    const limits = getPlanLimits(user.plan);
    if (!limits.s3ApiEnabled) {
      return {
        success: false,
        error: {
          code: "PLAN_DISABLED",
          message: "S3 API is not available on your current plan",
        },
      };
    }

    // Check bucket count limit
    const existingBuckets = await db
      .select({ count: sql<number>`count(*)` })
      .from(s3ApiBuckets)
      .where(eq(s3ApiBuckets.userId, userId));

    const bucketCount = Number(existingBuckets[0]?.count || 0);
    if (bucketCount >= limits.maxS3ApiBuckets) {
      return {
        success: false,
        error: {
          code: "BUCKET_LIMIT_EXCEEDED",
          message: `Bucket limit reached. Your ${user.plan} plan allows up to ${limits.maxS3ApiBuckets} bucket${limits.maxS3ApiBuckets === 1 ? "" : "s"}.`,
        },
      };
    }

    // Check if bucket already exists for this user
    const [existing] = await db
      .select()
      .from(s3ApiBuckets)
      .where(
        and(
          eq(s3ApiBuckets.userId, userId),
          eq(s3ApiBuckets.bucketName, bucketName)
        )
      )
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: {
          code: "ALREADY_EXISTS",
          message: `Bucket '${bucketName}' already exists`,
        },
      };
    }

    // Create the bucket
    const [bucket] = await db
      .insert(s3ApiBuckets)
      .values({
        userId,
        bucketName,
      })
      .returning();

    return {
      success: true,
      bucket: {
        id: bucket.id,
        bucketName: bucket.bucketName,
        storageUsed: bucket.storageUsed,
        objectCount: bucket.objectCount,
        isActive: bucket.isActive,
        createdAt: bucket.createdAt,
        updatedAt: bucket.updatedAt,
      },
    };
  }

  /**
   * Get a bucket by name
   */
  async getBucket(userId: string, bucketName: string): Promise<BucketInfo | null> {
    const [bucket] = await db
      .select()
      .from(s3ApiBuckets)
      .where(
        and(
          eq(s3ApiBuckets.userId, userId),
          eq(s3ApiBuckets.bucketName, bucketName)
        )
      )
      .limit(1);

    if (!bucket) return null;

    return {
      id: bucket.id,
      bucketName: bucket.bucketName,
      storageUsed: bucket.storageUsed,
      objectCount: bucket.objectCount,
      isActive: bucket.isActive,
      createdAt: bucket.createdAt,
      updatedAt: bucket.updatedAt,
    };
  }

  /**
   * List all buckets for a user
   */
  async listBuckets(userId: string): Promise<BucketInfo[]> {
    const buckets = await db
      .select()
      .from(s3ApiBuckets)
      .where(eq(s3ApiBuckets.userId, userId))
      .orderBy(s3ApiBuckets.createdAt);

    return buckets.map(bucket => ({
      id: bucket.id,
      bucketName: bucket.bucketName,
      storageUsed: bucket.storageUsed,
      objectCount: bucket.objectCount,
      isActive: bucket.isActive,
      createdAt: bucket.createdAt,
      updatedAt: bucket.updatedAt,
    }));
  }

  /**
   * Delete a bucket
   * @param force - If true, delete all objects first, then delete bucket
   */
  async deleteBucket(userId: string, bucketName: string, force: boolean = false): Promise<{
    success: boolean;
    error?: string;
    deletedObjects?: number;
    freedBytes?: number;
  }> {
    const bucket = await this.getBucket(userId, bucketName);

    if (!bucket) {
      return { success: false, error: "Bucket not found" };
    }

    // Check if bucket has objects
    if (bucket.objectCount > 0) {
      if (!force) {
        return { success: false, error: "Bucket is not empty" };
      }

      // Force delete: remove all objects first. Each page takes the same per-object leases as
      // PutObject/DeleteObject, so a concurrent write or delete cannot credit the same bytes twice.
      let deletedObjects = 0;
      let freedBytes = 0;
      let busy = false;
      let continuationToken: string | undefined;
      do {
        const pageToken = continuationToken;
        const page = await s3ApiStorageService.listObjects(userId, bucketName, { maxKeys: 1000, continuationToken: pageToken });
        continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
        if (page.objects.length === 0) break;

        const lease = await acquireObjectLeases(userId, bucketName, page.objects.map((obj) => obj.key));
        if (lease.keys.length < page.objects.length) busy = true;
        try {
          // Sizes are read again while the leases are held; a key gone by now was already deleted elsewhere
          const current = await s3ApiStorageService.listObjects(userId, bucketName, { maxKeys: 1000, continuationToken: pageToken });
          const sizes = new Map(current.objects.map((obj) => [obj.key, obj.size]));
          const toDelete = lease.keys.filter((key) => sizes.has(key));
          const failed = await s3ApiStorageService.deleteObjects(userId, bucketName, toDelete);
          if (failed.size > 0) busy = true;
          const deleted = toDelete.filter((key) => !failed.has(key));
          const bytes = deleted.reduce((sum, key) => sum + (sizes.get(key) ?? 0), 0);

          if (deleted.length > 0) {
            await db
              .update(users)
              .set({
                storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${bytes})`,
                fileCount: sql`GREATEST(0, ${users.fileCount} - ${deleted.length})`,
              })
              .where(eq(users.id, userId));
            await db
              .update(s3ApiBuckets)
              .set({
                storageUsed: sql`GREATEST(0, ${s3ApiBuckets.storageUsed} - ${bytes})`,
                objectCount: sql`GREATEST(0, ${s3ApiBuckets.objectCount} - ${deleted.length})`,
                updatedAt: new Date(),
              })
              .where(and(eq(s3ApiBuckets.userId, userId), eq(s3ApiBuckets.bucketName, bucketName)));
          }
          deletedObjects += deleted.length;
          freedBytes += bytes;
        } finally {
          await releaseObjectLeases(userId, bucketName, lease.token).catch((err) =>
            s3ApiLog.error({ err }, "Failed to release S3 object leases")
          );
        }
      } while (continuationToken);

      // Keep the bucket if another request held an object or added one while we were deleting
      const remaining = busy ? null : await s3ApiStorageService.listObjects(userId, bucketName, { maxKeys: 1 });
      if (busy || (remaining && remaining.objects.length > 0)) {
        return { success: false, error: "Objects in this bucket changed during deletion; try again", deletedObjects, freedBytes };
      }

      // Delete the bucket record
      await db
        .delete(s3ApiBuckets)
        .where(
          and(
            eq(s3ApiBuckets.userId, userId),
            eq(s3ApiBuckets.bucketName, bucketName)
          )
        );

      return { success: true, deletedObjects, freedBytes };
    }

    // Bucket is empty, just delete the record
    await db
      .delete(s3ApiBuckets)
      .where(
        and(
          eq(s3ApiBuckets.userId, userId),
          eq(s3ApiBuckets.bucketName, bucketName)
        )
      );

    return { success: true };
  }

  /**
   * Check if a bucket exists and user has access
   */
  async bucketExists(userId: string, bucketName: string): Promise<boolean> {
    const bucket = await this.getBucket(userId, bucketName);
    return bucket !== null && bucket.isActive;
  }

  /**
   * Get or create bucket (auto-create on first upload)
   */
  async getOrCreateBucket(userId: string, bucketName: string): Promise<BucketInfo | null> {
    let bucket = await this.getBucket(userId, bucketName);

    if (!bucket) {
      const result = await this.createBucket(userId, bucketName);
      if (!result.success) return null;
      bucket = result.bucket!;
    }

    return bucket;
  }
}

export const s3ApiBucketService = new S3ApiBucketService();
