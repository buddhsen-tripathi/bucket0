import { dbService } from "@/lib/shared/db-service";
import { formatBytes, type PlanLimits } from "@/lib/payments/plans";
import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";

/** Minimal user info needed for storage quota operations */
export interface UserQuotaInfo {
  plan: string;
  storageUsage: number;
}

export type LimitErrorCode = "STORAGE_LIMIT" | "FILE_SIZE_LIMIT" | "FILE_COUNT_LIMIT";

export interface LimitErrorDetails {
  storageLimit?: number;
  storageLimitFormatted?: string;
  storageUsage?: number;
  storageUsageFormatted?: string;
  remaining?: number;
  remainingFormatted?: string;
  maxFileSize?: number;
  maxFileSizeFormatted?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  plan: string;
}

export interface LimitError {
  error: string;
  code: LimitErrorCode;
  details: LimitErrorDetails;
}

export interface StorageQuotaResult {
  success: boolean;
  error?: LimitError;
  /** The key already belongs to the other surface (Agent Storage vs My Drive). */
  surfaceConflict?: boolean;
  isNewFile: boolean;
  existingSize: number;
}

// Windows reserved names (case-insensitive)
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

// Limits
const MAX_SEGMENT_LENGTH = 255; // Common filesystem limit
const MAX_PATH_LENGTH = 1024; // R2 key limit

/**
 * Sanitize a filename while preserving folder structure
 *
 * Security measures:
 * - Blocks path traversal sequences (..)
 * - Blocks Windows reserved names (CON, PRN, etc.)
 * - Enforces length limits (255 per segment, 1024 total)
 * - Replaces special characters with underscores
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    return "_unnamed_file";
  }

  const segments = filename.split("/");
  const sanitizedSegments = segments.map((part, index) => {
    // Skip empty segments
    if (!part) return "";

    // Block path traversal sequences
    if (part === "." || part === "..") {
      cloudLog.warn({ part }, "Blocked path traversal");
      return "_";
    }

    let sanitized = part;

    // Remove embedded .. sequences (e.g., "foo..bar" or "..hidden")
    if (sanitized.includes("..")) {
      sanitized = sanitized.replace(/\.\./g, "_");
      cloudLog.warn({ part }, "Removed embedded path traversal");
    }

    // Replace special characters (keep alphanumeric, dots, underscores, hyphens)
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Remove leading/trailing dots and spaces (hidden files, Windows compat)
    sanitized = sanitized.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");

    // Block Windows reserved names
    const baseName = sanitized.split(".")[0].toLowerCase();
    if (WINDOWS_RESERVED_NAMES.has(baseName)) {
      cloudLog.warn({ name: sanitized }, "Blocked Windows reserved name");
      sanitized = "_" + sanitized;
    }

    // Enforce segment length limit (preserve extension if possible)
    if (sanitized.length > MAX_SEGMENT_LENGTH) {
      const lastDot = sanitized.lastIndexOf(".");
      if (lastDot > 0 && lastDot > sanitized.length - 10) {
        const ext = sanitized.slice(lastDot);
        sanitized = sanitized.slice(0, MAX_SEGMENT_LENGTH - ext.length) + ext;
      } else {
        sanitized = sanitized.slice(0, MAX_SEGMENT_LENGTH);
      }
      cloudLog.warn({ maxLength: MAX_SEGMENT_LENGTH }, "Truncated segment");
    }

    // Ensure non-empty result
    return sanitized || `_segment_${index}`;
  });

  // Filter empty segments and join
  let result = sanitizedSegments.filter(Boolean).join("/");

  // Enforce total path length limit
  if (result.length > MAX_PATH_LENGTH) {
    result = result.slice(0, MAX_PATH_LENGTH);
    cloudLog.warn({ maxLength: MAX_PATH_LENGTH }, "Truncated path");
  }

  return result || "_unnamed_file";
}

/**
 * Validate file size against plan limits
 * Returns null if valid, or a LimitError if the file is too large
 */
export function validateFileSize(
  size: number,
  limits: PlanLimits,
  plan: string
): LimitError | null {
  if (size > limits.maxFileSizeBytes) {
    return {
      error: `File too large. Maximum file size is ${formatBytes(limits.maxFileSizeBytes)} for your plan.`,
      code: "FILE_SIZE_LIMIT",
      details: {
        maxFileSize: limits.maxFileSizeBytes,
        maxFileSizeFormatted: formatBytes(limits.maxFileSizeBytes),
        fileSize: size,
        fileSizeFormatted: formatBytes(size),
        plan,
      },
    };
  }
  return null;
}

/**
 * Handle storage quota reservation for file uploads
 * Handles both new files and overwrites with proper quota management
 */
export async function handleStorageQuota(
  userId: string,
  size: number,
  safeFilename: string,
  dbUser: UserQuotaInfo,
  limits: PlanLimits,
  isAgentUpload = false
): Promise<StorageQuotaResult> {
  // Check if file already exists in database (for overwrites)
  // Using DB instead of R2 eliminates race condition between file check and quota update
  const fileKey = `users/${userId}/${safeFilename}`;
  const [existingFile] = await db
    .select({ fileSize: cloudFiles.fileSize, isAgentUpload: cloudFiles.isAgentUpload })
    .from(cloudFiles)
    .where(
      and(
        eq(cloudFiles.userId, userId),
        eq(cloudFiles.fileKey, fileKey)
      )
    )
    .limit(1);

  const existingSize = existingFile?.fileSize ?? 0;
  const isNewFile = !existingFile;

  // Never overwrite a file across the Agent Storage / My Drive boundary.
  if (existingFile && existingFile.isAgentUpload !== isAgentUpload) {
    return { success: false, surfaceConflict: true, isNewFile, existingSize };
  }

  if (!isNewFile) {
    // File exists - this is an overwrite
    if (size > existingSize) {
      const diff = size - existingSize;
      const canReserve = await dbService.incrementUsageIfAllowed(userId, diff, 0);
      if (!canReserve) {
        const remaining = Math.max(0, limits.maxStorageBytes - dbUser.storageUsage);
        return {
          success: false,
          isNewFile,
          existingSize,
          error: {
            error: `Storage limit exceeded. You have ${formatBytes(remaining)} remaining.`,
            code: "STORAGE_LIMIT",
            details: {
              storageLimit: limits.maxStorageBytes,
              storageLimitFormatted: formatBytes(limits.maxStorageBytes),
              storageUsage: dbUser.storageUsage,
              storageUsageFormatted: formatBytes(dbUser.storageUsage),
              remaining,
              remainingFormatted: formatBytes(remaining),
              plan: dbUser.plan,
            },
          },
        };
      }
    } else if (size < existingSize) {
      // File is smaller than before, release the difference
      await dbService.decrementUsage(userId, existingSize - size, 0);
    }
    // If same size, no quota change needed
  } else {
    // New file - reserve space
    const reserved = await dbService.incrementUsageIfAllowed(userId, size, 1);
    if (!reserved) {
      const remaining = Math.max(0, limits.maxStorageBytes - dbUser.storageUsage);
      return {
        success: false,
        isNewFile,
        existingSize,
        error: {
          error: `Storage limit exceeded. You have ${formatBytes(remaining)} remaining. Upgrade your plan for more storage.`,
          code: "STORAGE_LIMIT",
          details: {
            storageLimit: limits.maxStorageBytes,
            storageLimitFormatted: formatBytes(limits.maxStorageBytes),
            storageUsage: dbUser.storageUsage,
            storageUsageFormatted: formatBytes(dbUser.storageUsage),
            remaining,
            remainingFormatted: formatBytes(remaining),
            plan: dbUser.plan,
          },
        },
      };
    }
  }

  return {
    success: true,
    isNewFile,
    existingSize,
  };
}

/**
 * Rollback storage quota changes on upload failure
 */
export async function rollbackStorageQuota(
  userId: string,
  size: number,
  isNewFile: boolean,
  existingSize: number
): Promise<void> {
  if (isNewFile) {
    await dbService.rollbackUsage(userId, size, 1);
  } else if (size > existingSize) {
    await dbService.rollbackUsage(userId, size - existingSize, 0);
  }
}
