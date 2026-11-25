import { runInBackground } from "@/server/context";
/**
 * Agent API Key Service
 *
 * Manages Bearer token API keys for AI agents. Keys follow the format:
 * - Key: b0ak_ prefix + 40 random base64url characters
 * - Storage: SHA-256 hash (not encrypted) — Bearer tokens don't need plaintext recovery
 *
 * This is more secure than the S3 API credential approach (which uses AES-256-GCM
 * because AWS Sig v4 requires the plaintext secret for signature verification).
 * Keys are shown once on creation, never again. Follows the GitHub/Stripe model.
 */

import { db } from "@/lib/shared/db";
import { agentApiKeys, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { getPlanLimits } from "@/lib/payments/plans";

const KEY_PREFIX = "b0ak_";

/**
 * Generate a random agent API key
 * Format: b0ak_ + 40 random base64url characters
 */
function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(30).toString("base64url").slice(0, 40);
}

/**
 * SHA-256 hash a key for storage/lookup
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * A destination folder is null/empty (Drive root) or a relative path without
 * a leading slash, backslashes, or empty/"."/".." segments. A trailing slash is allowed.
 */
export function isValidDestinationFolder(folder: unknown): boolean {
  if (folder === null || folder === undefined || folder === "") return true;
  if (typeof folder !== "string") return false;
  if (folder.startsWith("/") || folder.includes("\\")) return false;
  const segments = folder.endsWith("/") ? folder.slice(0, -1).split("/") : folder.split("/");
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}

export interface CreateKeyResult {
  success: boolean;
  key?: {
    id: string;
    apiKey: string; // Only returned on creation
    keyPrefix: string;
    name: string;
    destination: string;
    destinationFolder: string | null;
    createdAt: Date;
  };
  error?: {
    code: "LIMIT_EXCEEDED" | "PLAN_DISABLED" | "USER_NOT_FOUND";
    message: string;
  };
}

export interface AgentKeyInfo {
  id: string;
  keyPrefix: string;
  name: string;
  destination: string;
  destinationFolder: string | null;
  lastUsedAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ValidatedKey {
  userId: string;
  keyId: string;
  destination: string;
  destinationFolder: string | null;
}

class AgentKeyService {
  /**
   * Create a new agent API key for a user
   */
  async createKey(
    userId: string,
    name: string,
    destination: string = "agent",
    destinationFolder: string | null = null
  ): Promise<CreateKeyResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      };
    }

    const limits = getPlanLimits(user.plan);

    if (!limits.agentApiEnabled) {
      return {
        success: false,
        error: {
          code: "PLAN_DISABLED",
          message: "Agent API access is not available on your current plan.",
        },
      };
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.userId, userId));

    if (countResult.count >= limits.maxAgentApiKeys) {
      return {
        success: false,
        error: {
          code: "LIMIT_EXCEEDED",
          message: `You have reached the maximum of ${limits.maxAgentApiKeys} agent API keys for your plan.`,
        },
      };
    }

    const apiKey = generateApiKey();
    const keyHash = hashKey(apiKey);
    const keyPrefix = apiKey.slice(0, 12);

    const [created] = await db
      .insert(agentApiKeys)
      .values({
        userId,
        name: name.trim() || "Untitled Key",
        keyPrefix,
        keyHash,
        destination: destination === "drive" ? "drive" : "agent",
        destinationFolder: destination === "drive" ? destinationFolder : null,
      })
      .returning();

    return {
      success: true,
      key: {
        id: created.id,
        apiKey, // Only returned once
        keyPrefix: created.keyPrefix,
        name: created.name,
        destination: created.destination,
        destinationFolder: created.destinationFolder,
        createdAt: created.createdAt,
      },
    };
  }

  /**
   * Validate a Bearer token and return key info
   * Returns null if invalid, expired, or inactive
   */
  async validateKey(bearerToken: string): Promise<ValidatedKey | null> {
    if (!bearerToken.startsWith(KEY_PREFIX)) {
      return null;
    }

    const keyHash = hashKey(bearerToken);

    const [key] = await db
      .select({
        id: agentApiKeys.id,
        userId: agentApiKeys.userId,
        isActive: agentApiKeys.isActive,
        expiresAt: agentApiKeys.expiresAt,
        destination: agentApiKeys.destination,
        destinationFolder: agentApiKeys.destinationFolder,
      })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.keyHash, keyHash))
      .limit(1);

    if (!key) {
      return null;
    }

    if (!key.isActive) {
      return null;
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return null;
    }

    // Fire-and-forget lastUsedAt update
    await runInBackground(this.updateLastUsed(key.id).catch(() => {}));

    return {
      userId: key.userId,
      keyId: key.id,
      destination: key.destination,
      destinationFolder: key.destinationFolder,
    };
  }

  /**
   * List all keys for a user (without secrets)
   */
  async listKeys(userId: string): Promise<AgentKeyInfo[]> {
    return db
      .select({
        id: agentApiKeys.id,
        keyPrefix: agentApiKeys.keyPrefix,
        name: agentApiKeys.name,
        destination: agentApiKeys.destination,
        destinationFolder: agentApiKeys.destinationFolder,
        lastUsedAt: agentApiKeys.lastUsedAt,
        isActive: agentApiKeys.isActive,
        expiresAt: agentApiKeys.expiresAt,
        createdAt: agentApiKeys.createdAt,
      })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.userId, userId))
      .orderBy(agentApiKeys.createdAt);
  }

  /**
   * Update key settings (destination, name, active status)
   */
  async updateKey(
    userId: string,
    keyId: string,
    updates: {
      name?: string;
      destination?: string;
      destinationFolder?: string | null;
      isActive?: boolean;
    }
  ): Promise<boolean> {
    const setValues: Record<string, unknown> = {};

    if (updates.name !== undefined) {
      setValues.name = updates.name.trim() || "Untitled Key";
    }
    if (updates.destination !== undefined) {
      setValues.destination = updates.destination === "drive" ? "drive" : "agent";
    }
    if (updates.destinationFolder !== undefined) {
      setValues.destinationFolder = updates.destinationFolder;
    }
    if (updates.isActive !== undefined) {
      setValues.isActive = updates.isActive;
    }

    if (Object.keys(setValues).length === 0) {
      return false;
    }

    const result = await db
      .update(agentApiKeys)
      .set(setValues)
      .where(
        and(
          eq(agentApiKeys.id, keyId),
          eq(agentApiKeys.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Delete a key
   */
  async deleteKey(userId: string, keyId: string): Promise<boolean> {
    const result = await db
      .delete(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.id, keyId),
          eq(agentApiKeys.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Update last used timestamp (fire-and-forget)
   */
  async updateLastUsed(keyId: string): Promise<void> {
    await db
      .update(agentApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentApiKeys.id, keyId));
  }
}

export const agentKeyService = new AgentKeyService();
