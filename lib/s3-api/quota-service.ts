/**
 * S3 API Quota Service
 *
 * Manages quota for S3 API operations. S3 API storage counts against
 * the user's main storage quota (same as cloud storage).
 *
 * Uses atomic quota reservation pattern from db-service.ts.
 */

import { db } from "@/lib/shared/db";
import { users, s3ApiBuckets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPlanLimits, formatBytes, type UploadValidationResult } from "@/lib/payments/plans";

export interface QuotaCheckResult {
  allowed: boolean;
  error?: {
    code: "STORAGE_LIMIT" | "FILE_SIZE_LIMIT" | "PLAN_DISABLED";
    message: string;
    current: number;
    limit: number;
    requested: number;
  };
}

export interface AtomicQuotaResult {
  success: boolean;
  quotaExceeded?: boolean;
  error?: string;
}

export class S3ApiQuotaService {
  /**
   * Check if an upload is allowed based on user's plan
   */
  async checkUploadAllowed(
    userId: string,
    fileSize: number
  ): Promise<QuotaCheckResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        allowed: false,
        error: {
          code: "PLAN_DISABLED",
          message: "User not found",
          current: 0,
          limit: 0,
          requested: fileSize,
        },
      };
    }

    const limits = getPlanLimits(user.plan);

    // Check if S3 API is enabled
    if (!limits.s3ApiEnabled) {
      return {
        allowed: false,
        error: {
          code: "PLAN_DISABLED",
          message: "S3 API is not available on your current plan",
          current: user.storageUsage,
          limit: limits.maxStorageBytes,
          requested: fileSize,
        },
      };
    }

    // Check file size limit
    if (fileSize > limits.maxFileSizeBytes) {
      return {
        allowed: false,
        error: {
          code: "FILE_SIZE_LIMIT",
          message: `File size ${formatBytes(fileSize)} exceeds the ${formatBytes(limits.maxFileSizeBytes)} limit`,
          current: user.storageUsage,
          limit: limits.maxFileSizeBytes,
          requested: fileSize,
        },
      };
    }

    // Check storage limit
    const projectedUsage = user.storageUsage + fileSize;
    if (projectedUsage > limits.maxStorageBytes) {
      const remaining = Math.max(0, limits.maxStorageBytes - user.storageUsage);
      return {
        allowed: false,
        error: {
          code: "STORAGE_LIMIT",
          message: `Storage limit exceeded. You have ${formatBytes(remaining)} remaining of ${formatBytes(limits.maxStorageBytes)}`,
          current: user.storageUsage,
          limit: limits.maxStorageBytes,
          requested: fileSize,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Atomically reserve quota for an upload
   * Returns success if quota was reserved, false if limit exceeded
   */
  async reserveQuota(userId: string, size: number): Promise<AtomicQuotaResult> {
    // Get user's plan limit
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const limits = getPlanLimits(user.plan);

    if (!limits.s3ApiEnabled) {
      return { success: false, error: "S3 API not enabled for plan" };
    }

    // Atomic update with WHERE clause to prevent exceeding limit
    const result = await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${size}`,
        fileCount: sql`${users.fileCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.id} = ${userId} AND (${users.storageUsage} + ${size}) <= ${limits.maxStorageBytes}`
      )
      .returning();

    if (result.length === 0) {
      return { success: false, quotaExceeded: true };
    }

    return { success: true };
  }

  /**
   * Release reserved quota (on upload failure or delete)
   */
  async releaseQuota(userId: string, size: number): Promise<void> {
    await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${size})`,
        fileCount: sql`GREATEST(0, ${users.fileCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Update quota for a file replacement (different size)
   * Returns success if quota adjustment was successful
   */
  async adjustQuotaForReplace(
    userId: string,
    oldSize: number,
    newSize: number
  ): Promise<AtomicQuotaResult> {
    if (newSize === oldSize) {
      return { success: true };
    }

    if (newSize < oldSize) {
      // File got smaller, just decrement
      const diff = oldSize - newSize;
      await db
        .update(users)
        .set({
          storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${diff})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      return { success: true };
    }

    // File got larger, need to check quota
    const diff = newSize - oldSize;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const limits = getPlanLimits(user.plan);

    // Atomic update with limit check
    const result = await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${diff}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.id} = ${userId} AND (${users.storageUsage} + ${diff}) <= ${limits.maxStorageBytes}`
      )
      .returning();

    if (result.length === 0) {
      return { success: false, quotaExceeded: true };
    }

    return { success: true };
  }

  /**
   * Get user's current storage status
   */
  async getStorageStatus(userId: string): Promise<{
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
  } | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const limits = getPlanLimits(user.plan);
    const remaining = Math.max(0, limits.maxStorageBytes - user.storageUsage);
    const percentage = (user.storageUsage / limits.maxStorageBytes) * 100;

    return {
      used: user.storageUsage,
      limit: limits.maxStorageBytes,
      remaining,
      percentage: Math.min(100, percentage),
    };
  }

  // ==========================================
  // Bucket-level quota tracking
  // ==========================================

  /**
   * Update bucket storage statistics
   */
  async updateBucketStats(
    userId: string,
    bucketName: string,
    storageChange: number,
    countChange: number
  ): Promise<void> {
    await db
      .update(s3ApiBuckets)
      .set({
        storageUsed: sql`GREATEST(0, ${s3ApiBuckets.storageUsed} + ${storageChange})`,
        objectCount: sql`GREATEST(0, ${s3ApiBuckets.objectCount} + ${countChange})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(s3ApiBuckets.userId, userId),
          eq(s3ApiBuckets.bucketName, bucketName)
        )
      );
  }

  /**
   * Get bucket statistics
   */
  async getBucketStats(userId: string, bucketName: string): Promise<{
    storageUsed: number;
    objectCount: number;
  } | null> {
    const [bucket] = await db
      .select({
        storageUsed: s3ApiBuckets.storageUsed,
        objectCount: s3ApiBuckets.objectCount,
      })
      .from(s3ApiBuckets)
      .where(
        and(
          eq(s3ApiBuckets.userId, userId),
          eq(s3ApiBuckets.bucketName, bucketName)
        )
      )
      .limit(1);

    return bucket || null;
  }
}

export const s3ApiQuotaService = new S3ApiQuotaService();
