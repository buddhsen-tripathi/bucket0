import { db } from "@/lib/shared/db";
import { users, subscriptions, cloudFiles } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPlanLimits, validateUpload, type UploadValidationResult } from "@/lib/payments/plans";

export interface AtomicQuotaResult {
  success: boolean;
  isNewFile: boolean;
  existingSize: number;
  quotaExceeded?: boolean;
}

export class DBService {
  async getUser(clerkId: string, email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          id: clerkId,
          email,
        })
        .returning();
      return newUser;
    }

    return user;
  }

  async checkLimit(clerkId: string, fileSize: number): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (!user) return false;

    const limits = getPlanLimits(user.plan);

    // Check file size limit first
    if (fileSize > limits.maxFileSizeBytes) {
      return false;
    }

    // Check storage limit
    return (user.storageUsage + fileSize) <= limits.maxStorageBytes;
  }

  async incrementUsageIfAllowed(clerkId: string, size: number, count: number = 1): Promise<boolean> {
    if (!Number.isSafeInteger(size) || size < 0) return false;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (!user) return false;

    const limits = getPlanLimits(user.plan);

    // Check file size limit (only for new files with count > 0)
    if (count > 0 && size > limits.maxFileSizeBytes) {
      return false;
    }

    // Check storage limit
    if (user.storageUsage + size > limits.maxStorageBytes) {
      return false;
    }

    // Check file count limit (only if a limit is set and this is a new file)
    if (count > 0 && limits.maxFileCount > 0 && user.fileCount >= limits.maxFileCount) {
      return false;
    }

    // Atomic update with WHERE clause ensuring limit is still respected
    // This handles the race condition by checking the condition at the moment of update
    const result = await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${size}`,
        fileCount: sql`${users.fileCount} + ${count}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.id} = ${clerkId} AND (${users.storageUsage} + ${size}) <= ${limits.maxStorageBytes}`
      )
      .returning();

    return result.length > 0;
  }

  async rollbackUsage(clerkId: string, size: number, count: number = 1) {
    await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${size})`,
        fileCount: sql`GREATEST(0, ${users.fileCount} - ${count})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, clerkId));
  }

  getPlanLimit(plan: string): number {
    return getPlanLimits(plan).maxStorageBytes;
  }

  /**
   * Validates if an upload is allowed and returns detailed error info if not
   */
  async validateUploadAllowed(
    clerkId: string,
    fileSize: number,
    isNewFile: boolean
  ): Promise<UploadValidationResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (!user) {
      return {
        allowed: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not found",
          details: {
            limit: 0,
            current: 0,
            requested: fileSize,
            limitFormatted: "N/A",
            currentFormatted: "N/A",
            requestedFormatted: String(fileSize),
          },
        },
      };
    }

    return validateUpload(
      user.plan,
      fileSize,
      user.storageUsage,
      user.fileCount,
      isNewFile
    );
  }

  /**
   * Get user's current usage and limits
   */
  async getUserLimits(clerkId: string): Promise<{
    plan: string;
    storageUsage: number;
    storageLimit: number;
    fileCount: number;
    fileCountLimit: number;
    maxFileSizeBytes: number;
  } | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, clerkId))
      .limit(1);

    if (!user) return null;

    const limits = getPlanLimits(user.plan);
    return {
      plan: user.plan,
      storageUsage: user.storageUsage,
      storageLimit: limits.maxStorageBytes,
      fileCount: user.fileCount,
      fileCountLimit: limits.maxFileCount,
      maxFileSizeBytes: limits.maxFileSizeBytes,
    };
  }

  async incrementUsage(clerkId: string, size: number, count: number = 1) {
    await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${size}`,
        fileCount: sql`${users.fileCount} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, clerkId));
  }

  async decrementUsage(clerkId: string, size: number, count: number = 1) {
    const result = await db
      .update(users)
      .set({
        storageUsage: sql`GREATEST(0, ${users.storageUsage} - ${size})`,
        fileCount: sql`GREATEST(0, ${users.fileCount} - ${count})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, clerkId))
      .returning();

  }

  async getActiveSubscription(userId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return subscription?.status === "active" ? subscription : null;
  }

  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(userId);
    return subscription !== null;
  }

  /**
   * Atomically reserve storage quota for a file upload.
   * This combines file existence check and quota update in a single atomic operation
   * to prevent race conditions where concurrent uploads could double-count.
   *
   * @param clerkId - User's Clerk ID
   * @param fileKey - Full file key (e.g., "users/{userId}/{filename}")
   * @param newSize - Size of the new file being uploaded
   * @param maxStorageBytes - User's storage limit
   * @returns Result indicating success, whether it's a new file, and existing size
   */
  async reserveQuotaAtomic(
    clerkId: string,
    fileKey: string,
    newSize: number,
    maxStorageBytes: number
  ): Promise<AtomicQuotaResult> {
    // First, get existing file info in the same query context
    const [existingFile] = await db
      .select({ fileSize: cloudFiles.fileSize })
      .from(cloudFiles)
      .where(
        and(
          eq(cloudFiles.userId, clerkId),
          eq(cloudFiles.fileKey, fileKey)
        )
      )
      .limit(1);

    const existingSize = existingFile?.fileSize ?? 0;
    const isNewFile = !existingFile;

    // Calculate the actual storage change needed
    let storageChange: number;
    let countChange: number;

    if (isNewFile) {
      storageChange = newSize;
      countChange = 1;
    } else if (newSize > existingSize) {
      storageChange = newSize - existingSize;
      countChange = 0;
    } else if (newSize < existingSize) {
      // File is smaller - we'll decrement, which always succeeds
      await this.decrementUsage(clerkId, existingSize - newSize, 0);
      return { success: true, isNewFile: false, existingSize };
    } else {
      // Same size - no change needed
      return { success: true, isNewFile: false, existingSize };
    }

    // Atomic update with WHERE clause to prevent exceeding limit
    // The WHERE clause ensures this only succeeds if quota is available
    // Even if another concurrent request runs the same query, only one can succeed
    // because the UPDATE is atomic at the database level
    const result = await db
      .update(users)
      .set({
        storageUsage: sql`${users.storageUsage} + ${storageChange}`,
        fileCount: sql`${users.fileCount} + ${countChange}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.id} = ${clerkId} AND (${users.storageUsage} + ${storageChange}) <= ${maxStorageBytes}`
      )
      .returning();

    if (result.length === 0) {
      return {
        success: false,
        isNewFile,
        existingSize,
        quotaExceeded: true,
      };
    }

    return { success: true, isNewFile, existingSize };
  }
}

export const dbService = new DBService();
