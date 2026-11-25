/**
 * S3 API Credential Service
 *
 * Manages S3 API access keys for users. Access keys follow the format:
 * - Access Key ID: B0IA followed by 16 random uppercase alphanumeric characters (20 chars total)
 * - Secret Access Key: 40 random characters (similar to AWS secret keys)
 *
 * The secret key is encrypted with AES-256-GCM (not hashed) to enable
 * AWS Signature v4 verification which requires the plaintext secret.
 */

import { db } from "@/lib/shared/db";
import { s3ApiCredentials, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getPlanLimits } from "@/lib/payments/plans";
import {
  encryptCredential,
  decryptCredential,
} from "@/lib/s3/server-credential-encryption";

// Access Key ID prefix (similar to AWS AKIA prefix)
const ACCESS_KEY_PREFIX = "B0IA";

/**
 * Generate a random access key ID
 * Format: B0IA + 16 random alphanumeric characters
 */
function generateAccessKeyId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomPart = Array.from(randomBytes(16))
    .map(b => chars[b % chars.length])
    .join("");
  return ACCESS_KEY_PREFIX + randomPart;
}

/**
 * Generate a random secret access key
 * 40 characters, base64-like encoding for AWS compatibility
 */
function generateSecretAccessKey(): string {
  return randomBytes(30).toString("base64").replace(/[+/=]/g, "").slice(0, 40);
}

export interface CreateCredentialResult {
  success: boolean;
  credential?: {
    id: string;
    accessKeyId: string;
    secretAccessKey: string; // Only returned on creation
    name: string;
    createdAt: Date;
  };
  error?: {
    code: "LIMIT_EXCEEDED" | "PLAN_DISABLED" | "USER_NOT_FOUND";
    message: string;
  };
}

export interface CredentialInfo {
  id: string;
  accessKeyId: string;
  name: string;
  lastUsedAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export class S3ApiCredentialService {
  /**
   * Create a new S3 API credential for a user
   */
  async createCredential(userId: string, name: string): Promise<CreateCredentialResult> {
    // Get user and check plan
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

    // Check if S3 API is enabled for this plan
    if (!limits.s3ApiEnabled) {
      return {
        success: false,
        error: {
          code: "PLAN_DISABLED",
          message: "S3 API access is not available on your current plan. Please upgrade to Starter or higher.",
        },
      };
    }

    // Count existing credentials
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(s3ApiCredentials)
      .where(eq(s3ApiCredentials.userId, userId));

    if (countResult.count >= limits.maxS3ApiKeys) {
      return {
        success: false,
        error: {
          code: "LIMIT_EXCEEDED",
          message: `You have reached the maximum of ${limits.maxS3ApiKeys} API keys for your plan.`,
        },
      };
    }

    // Generate credentials
    const accessKeyId = generateAccessKeyId();
    const secretAccessKey = generateSecretAccessKey();

    // Encrypt the secret key for storage (required for Sig v4 verification)
    const encrypted = encryptCredential(secretAccessKey);

    // Store in database
    const [credential] = await db
      .insert(s3ApiCredentials)
      .values({
        userId,
        accessKeyId,
        encryptedSecretKey: encrypted.encryptedData,
        secretKeyIv: encrypted.iv,
        secretKeyAuthTag: encrypted.authTag,
        name: name.trim() || "Untitled Key",
      })
      .returning();

    return {
      success: true,
      credential: {
        id: credential.id,
        accessKeyId: credential.accessKeyId,
        secretAccessKey, // Only returned once
        name: credential.name,
        createdAt: credential.createdAt,
      },
    };
  }

  /**
   * List all credentials for a user (without secrets)
   */
  async listCredentials(userId: string): Promise<CredentialInfo[]> {
    const credentials = await db
      .select({
        id: s3ApiCredentials.id,
        accessKeyId: s3ApiCredentials.accessKeyId,
        name: s3ApiCredentials.name,
        lastUsedAt: s3ApiCredentials.lastUsedAt,
        isActive: s3ApiCredentials.isActive,
        expiresAt: s3ApiCredentials.expiresAt,
        createdAt: s3ApiCredentials.createdAt,
      })
      .from(s3ApiCredentials)
      .where(eq(s3ApiCredentials.userId, userId))
      .orderBy(s3ApiCredentials.createdAt);

    return credentials;
  }

  /**
   * Get credential by access key ID (for authentication)
   * Returns the decrypted secret for signature verification
   */
  async getCredentialByAccessKey(accessKeyId: string): Promise<{
    userId: string;
    secretAccessKey: string; // Decrypted for Sig v4 verification
    isActive: boolean;
    expiresAt: Date | null;
    id: string;
  } | null> {
    const [credential] = await db
      .select({
        id: s3ApiCredentials.id,
        userId: s3ApiCredentials.userId,
        encryptedSecretKey: s3ApiCredentials.encryptedSecretKey,
        secretKeyIv: s3ApiCredentials.secretKeyIv,
        secretKeyAuthTag: s3ApiCredentials.secretKeyAuthTag,
        isActive: s3ApiCredentials.isActive,
        expiresAt: s3ApiCredentials.expiresAt,
      })
      .from(s3ApiCredentials)
      .where(eq(s3ApiCredentials.accessKeyId, accessKeyId))
      .limit(1);

    if (!credential) {
      return null;
    }

    // Decrypt the secret key
    const secretAccessKey = decryptCredential(
      credential.encryptedSecretKey,
      credential.secretKeyIv,
      credential.secretKeyAuthTag
    );

    return {
      id: credential.id,
      userId: credential.userId,
      secretAccessKey,
      isActive: credential.isActive,
      expiresAt: credential.expiresAt,
    };
  }

  /**
   * Update last used timestamp for a credential
   */
  async updateLastUsed(credentialId: string): Promise<void> {
    await db
      .update(s3ApiCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(s3ApiCredentials.id, credentialId));
  }

  /**
   * Delete a credential
   */
  async deleteCredential(userId: string, credentialId: string): Promise<boolean> {
    const result = await db
      .delete(s3ApiCredentials)
      .where(
        and(
          eq(s3ApiCredentials.id, credentialId),
          eq(s3ApiCredentials.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Deactivate a credential (soft delete)
   */
  async deactivateCredential(userId: string, credentialId: string): Promise<boolean> {
    const result = await db
      .update(s3ApiCredentials)
      .set({ isActive: false })
      .where(
        and(
          eq(s3ApiCredentials.id, credentialId),
          eq(s3ApiCredentials.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Validate a credential is active and not expired
   */
  isCredentialValid(
    isActive: boolean,
    expiresAt: Date | null
  ): { valid: boolean; reason?: string } {
    if (!isActive) {
      return { valid: false, reason: "Credential is deactivated" };
    }

    if (expiresAt && expiresAt < new Date()) {
      return { valid: false, reason: "Credential has expired" };
    }

    return { valid: true };
  }
}

export const s3ApiCredentialService = new S3ApiCredentialService();
