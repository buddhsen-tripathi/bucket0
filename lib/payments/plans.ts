/**
 * Plan limits configuration
 * Single source of truth for all plan-related limits and features
 */

export type PlanType = "free" | "starter" | "pro" | "scale";

export interface PlanLimits {
  /** Maximum storage in bytes */
  maxStorageBytes: number;
  /** Maximum single file size in bytes */
  maxFileSizeBytes: number;
  /** Maximum number of files (0 = unlimited) */
  maxFileCount: number;
  /** Maximum number of S3 bucket connections */
  maxBucketConnections: number;
  /** Maximum teams user can own (0 = no team feature) */
  maxTeams: number;
  /** Maximum team members per team (0 = no team feature) */
  maxTeamMembers: number;
  /** Whether API access is allowed */
  apiAccess: boolean;
  /** Whether share links are allowed */
  shareLinksEnabled: boolean;
  /** Whether activity logs are enabled */
  activityLogsEnabled: boolean;
  /** Activity log retention days (0 = disabled) */
  activityRetentionDays: number;
  /** Whether team chat is enabled */
  chatEnabled: boolean;
  /** Whether S3-compatible API access is enabled */
  s3ApiEnabled: boolean;
  /** Maximum number of S3 API access keys (secrets) */
  maxS3ApiKeys: number;
  /** Maximum number of S3 API buckets */
  maxS3ApiBuckets: number;
  /** Whether agent API access is enabled */
  agentApiEnabled: boolean;
  /** Maximum number of agent API keys */
  maxAgentApiKeys: number;
  /** Whether AgentBucket semantic memory (indexing + search) is enabled */
  memoryEnabled: boolean;
  /** Maximum number of stored memory chunks (0 = disabled) */
  maxMemoryChunks: number;
}

export interface PlanConfig {
  name: string;
  limits: PlanLimits;
}

// Storage size helpers
const GB = 1024 * 1024 * 1024;
const TB = 1024 * GB;

export const PLAN_CONFIGS: Record<PlanType, PlanConfig> = {
  free: {
    name: "Free",
    limits: {
      maxStorageBytes: 5 * GB,          // 5 GB total storage
      maxFileSizeBytes: 1 * GB,         // 1 GB per file
      maxFileCount: 0,                   // Unlimited files
      maxBucketConnections: 1,           // 1 S3 connection
      maxTeams: 0,                       // No teams
      maxTeamMembers: 0,                 // No team feature
      apiAccess: false,
      shareLinksEnabled: true,
      activityLogsEnabled: false,
      activityRetentionDays: 0,
      chatEnabled: false,
      s3ApiEnabled: true,               // S3 API enabled for free
      maxS3ApiKeys: 1,                  // 1 secret
      maxS3ApiBuckets: 1,               // 1 bucket
      agentApiEnabled: true,            // Agent API enabled for free
      maxAgentApiKeys: 1,               // 1 agent key
      memoryEnabled: false,             // No AgentBucket+ memory on Free
      maxMemoryChunks: 0,
    },
  },
  starter: {
    name: "Starter",
    limits: {
      maxStorageBytes: 150 * GB,        // 150 GB total storage
      maxFileSizeBytes: 5 * GB,         // 5 GB per file
      maxFileCount: 0,                   // Unlimited files
      maxBucketConnections: 10,          // 10 S3 connections
      maxTeams: 1,                       // 1 team
      maxTeamMembers: 3,                 // 3 members per team
      apiAccess: false,
      shareLinksEnabled: true,
      activityLogsEnabled: true,
      activityRetentionDays: 30,
      chatEnabled: false,
      s3ApiEnabled: true,
      maxS3ApiKeys: 5,                  // 5 secrets (max for all plans)
      maxS3ApiBuckets: 10,              // 10 buckets
      agentApiEnabled: true,
      maxAgentApiKeys: 3,               // 3 agent keys
      memoryEnabled: true,              // AgentBucket+ memory (entry tier)
      maxMemoryChunks: 10000,           // 10k chunks
    },
  },
  pro: {
    name: "Pro",
    limits: {
      maxStorageBytes: 700 * GB,        // 700 GB total storage
      maxFileSizeBytes: 15 * GB,        // 15 GB per file
      maxFileCount: 0,                   // Unlimited files
      maxBucketConnections: 25,          // 25 S3 connections
      maxTeams: 1,                       // 1 team
      maxTeamMembers: 5,                 // 5 members per team
      apiAccess: true,
      shareLinksEnabled: true,
      activityLogsEnabled: true,
      activityRetentionDays: 90,
      chatEnabled: true,
      s3ApiEnabled: true,
      maxS3ApiKeys: 5,                  // 5 secrets (max for all plans)
      maxS3ApiBuckets: 50,              // 50 buckets
      agentApiEnabled: true,
      maxAgentApiKeys: 5,               // 5 agent keys
      memoryEnabled: true,              // Memory enabled
      maxMemoryChunks: 50000,           // 50k chunks
    },
  },
  scale: {
    name: "Scale",
    limits: {
      maxStorageBytes: 2 * TB,          // 2 TB total storage
      maxFileSizeBytes: 15 * GB,        // 15 GB per file
      maxFileCount: 0,                   // Unlimited files
      maxBucketConnections: 100,         // 100 S3 connections
      maxTeams: 2,                       // 2 teams
      maxTeamMembers: 10,                // 10 members per team
      apiAccess: true,
      shareLinksEnabled: true,
      activityLogsEnabled: true,
      activityRetentionDays: 180,
      chatEnabled: true,
      s3ApiEnabled: true,
      maxS3ApiKeys: 5,                  // 5 secrets (max for all plans)
      maxS3ApiBuckets: 100,             // 100 buckets
      agentApiEnabled: true,
      maxAgentApiKeys: 5,               // 5 agent keys
      memoryEnabled: true,              // Memory enabled
      maxMemoryChunks: 200000,          // 200k chunks
    },
  },
};

/**
 * Get plan configuration for a given plan type
 */
export function getPlanConfig(plan: string): PlanConfig {
  const planType = plan as PlanType;
  return PLAN_CONFIGS[planType] || PLAN_CONFIGS.free;
}

/**
 * Get plan limits for a given plan type
 */
export function getPlanLimits(plan: string): PlanLimits {
  return getPlanConfig(plan).limits;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  const decimals = 2;

  return `${value.toFixed(decimals)} ${units[i]}`;
}

/**
 * Validation result for upload attempts
 */
export interface UploadValidationResult {
  allowed: boolean;
  error?: {
    code: "STORAGE_LIMIT" | "FILE_SIZE_LIMIT" | "FILE_COUNT_LIMIT" | "UNAUTHORIZED";
    message: string;
    details: {
      limit: number;
      current: number;
      requested: number;
      limitFormatted: string;
      currentFormatted: string;
      requestedFormatted: string;
    };
  };
}

/**
 * Validate if an upload is allowed based on plan limits
 */
export function validateUpload(
  plan: string,
  fileSize: number,
  currentStorageUsage: number,
  currentFileCount: number,
  isNewFile: boolean
): UploadValidationResult {
  const limits = getPlanLimits(plan);

  // Check single file size limit
  if (fileSize > limits.maxFileSizeBytes) {
    return {
      allowed: false,
      error: {
        code: "FILE_SIZE_LIMIT",
        message: `File size exceeds the ${formatBytes(limits.maxFileSizeBytes)} limit for your ${getPlanConfig(plan).name} plan.`,
        details: {
          limit: limits.maxFileSizeBytes,
          current: 0,
          requested: fileSize,
          limitFormatted: formatBytes(limits.maxFileSizeBytes),
          currentFormatted: "N/A",
          requestedFormatted: formatBytes(fileSize),
        },
      },
    };
  }

  // Check storage limit
  const projectedUsage = currentStorageUsage + fileSize;
  if (projectedUsage > limits.maxStorageBytes) {
    const remaining = Math.max(0, limits.maxStorageBytes - currentStorageUsage);
    return {
      allowed: false,
      error: {
        code: "STORAGE_LIMIT",
        message: `Storage limit exceeded. You have ${formatBytes(remaining)} remaining of your ${formatBytes(limits.maxStorageBytes)} ${getPlanConfig(plan).name} plan.`,
        details: {
          limit: limits.maxStorageBytes,
          current: currentStorageUsage,
          requested: fileSize,
          limitFormatted: formatBytes(limits.maxStorageBytes),
          currentFormatted: formatBytes(currentStorageUsage),
          requestedFormatted: formatBytes(fileSize),
        },
      },
    };
  }

  // Check file count limit (only for new files, and only if limit is set)
  if (isNewFile && limits.maxFileCount > 0) {
    if (currentFileCount >= limits.maxFileCount) {
      return {
        allowed: false,
        error: {
          code: "FILE_COUNT_LIMIT",
          message: `File count limit reached. Your ${getPlanConfig(plan).name} plan allows up to ${limits.maxFileCount} files.`,
          details: {
            limit: limits.maxFileCount,
            current: currentFileCount,
            requested: 1,
            limitFormatted: limits.maxFileCount.toString(),
            currentFormatted: currentFileCount.toString(),
            requestedFormatted: "1",
          },
        },
      };
    }
  }

  return { allowed: true };
}

// ==================== TEAM FEATURES ====================

/**
 * Check if a user's plan allows creating teams
 */
export function canCreateTeam(plan: string): boolean {
  const limits = getPlanLimits(plan);
  return limits.maxTeams > 0;
}

/**
 * Get max teams a user can own
 */
export function getMaxTeams(plan: string): number {
  return getPlanLimits(plan).maxTeams;
}

/**
 * Get max team members allowed for a plan (per team, excluding owner)
 */
export function getMaxTeamMembers(plan: string): number {
  return getPlanLimits(plan).maxTeamMembers;
}

/**
 * Validate team upload against owner's storage quota
 * Team uploads share the owner's plan storage
 */
export function validateTeamUploadAgainstOwner(
  ownerPlan: string,
  ownerStorageUsage: number,
  ownerFileCount: number,
  fileSize: number,
  isNewFile: boolean
): UploadValidationResult {
  const limits = getPlanLimits(ownerPlan);
  const planName = getPlanConfig(ownerPlan).name;

  // Check single file size limit (use owner's plan limit)
  if (fileSize > limits.maxFileSizeBytes) {
    return {
      allowed: false,
      error: {
        code: "FILE_SIZE_LIMIT",
        message: `File size exceeds the ${formatBytes(limits.maxFileSizeBytes)} limit for the team owner's ${planName} plan.`,
        details: {
          limit: limits.maxFileSizeBytes,
          current: 0,
          requested: fileSize,
          limitFormatted: formatBytes(limits.maxFileSizeBytes),
          currentFormatted: "N/A",
          requestedFormatted: formatBytes(fileSize),
        },
      },
    };
  }

  // Check storage limit against owner's total usage (personal + team)
  const projectedUsage = ownerStorageUsage + fileSize;
  if (projectedUsage > limits.maxStorageBytes) {
    const remaining = Math.max(0, limits.maxStorageBytes - ownerStorageUsage);
    return {
      allowed: false,
      error: {
        code: "STORAGE_LIMIT",
        message: `Team storage limit exceeded. The team owner has ${formatBytes(remaining)} remaining of their ${formatBytes(limits.maxStorageBytes)} ${planName} plan.`,
        details: {
          limit: limits.maxStorageBytes,
          current: ownerStorageUsage,
          requested: fileSize,
          limitFormatted: formatBytes(limits.maxStorageBytes),
          currentFormatted: formatBytes(ownerStorageUsage),
          requestedFormatted: formatBytes(fileSize),
        },
      },
    };
  }

  // Check file count limit (only for new files, and only if limit is set)
  if (isNewFile && limits.maxFileCount > 0) {
    if (ownerFileCount >= limits.maxFileCount) {
      return {
        allowed: false,
        error: {
          code: "FILE_COUNT_LIMIT",
          message: `File count limit reached. The team owner's ${planName} plan allows up to ${limits.maxFileCount} files.`,
          details: {
            limit: limits.maxFileCount,
            current: ownerFileCount,
            requested: 1,
            limitFormatted: limits.maxFileCount.toString(),
            currentFormatted: ownerFileCount.toString(),
            requestedFormatted: "1",
          },
        },
      };
    }
  }

  return { allowed: true };
}

