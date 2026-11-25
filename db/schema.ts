import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, timestamp, bigint, text, boolean, unique, uniqueIndex, index, vector, check, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk ID
  email: varchar("email", { length: 255 }).notNull(),
  plan: varchar("plan", { length: 50 }).default("free").notNull(),
  storageUsage: bigint("storage_usage", { mode: "number" }).default(0).notNull(), // In bytes
  fileCount: integer("file_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Owner's Clerk ID
  fileKey: text("file_key").notNull(), // File path in R2
  fileName: varchar("file_name", { length: 500 }).notNull(),
  targetType: varchar("target_type", { length: 20 }).default("file").notNull(), // "file" or "folder"
  accessType: varchar("access_type", { length: 20 }).default("anyone").notNull(), // "anyone" or "protected"
  isActive: boolean("is_active").default(true).notNull(),
  accessCount: integer("access_count").default(0).notNull(),
  allowDownload: boolean("allow_download").default(true).notNull(),
  allowAddToDrive: boolean("allow_add_to_drive").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_share_links_user_target").on(table.userId, table.targetType, table.fileKey),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Shared upload leases and quota reservations; never store these in isolate memory.
export const chunkedUploads = pgTable("chunked_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(),
  uploadId: text("upload_id"),
  size: bigint("size", { mode: "number" }).notNull(),
  contentType: text("content_type").notNull(),
  encrypted: boolean("encrypted").notNull(),
  existingSize: bigint("existing_size", { mode: "number" }).default(0).notNull(),
  isNewFile: boolean("is_new_file").default(false).notNull(),
  reservedBytes: bigint("reserved_bytes", { mode: "number" }).default(0).notNull(),
  reservedFiles: integer("reserved_files").default(0).notNull(),
  state: text("state").default("pending").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  operationToken: text("operation_token"),
}, (table) => [
  uniqueIndex("idx_chunked_uploads_user_key").on(table.userId, table.fileKey),
  uniqueIndex("idx_chunked_uploads_user_upload").on(table.userId, table.uploadId),
  index("idx_chunked_uploads_updated").on(table.updatedAt),
  check("chunked_uploads_size_check", sql`${table.size} > 0`),
  check("chunked_uploads_state_check", sql`${table.state} IN ('pending', 'reserved', 'active', 'completing', 'aborting')`),
]);
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(), // Polar subscription ID
  userId: text("user_id"), // Clerk ID (null for team subscriptions)
  teamId: text("team_id"), // Team ID (null for personal subscriptions)
  polarCustomerId: text("polar_customer_id"),
  productId: text("product_id").notNull(),
  status: varchar("status", { length: 50 }).notNull(), // active, canceled, past_due
  seatCount: integer("seat_count").default(1).notNull(), // For team subscriptions
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export const cloudFiles = pgTable("cloud_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner of the file
  fileKey: text("file_key").notNull(), // File path in R2 (users/{userId}/filename)
  fileName: varchar("file_name", { length: 500 }).notNull(),
  folderPath: text("folder_path").default("").notNull(), // Parent directory relative to the user root, ending in "/"; "" = drive root. Derived from fileKey; powers folder-scoped listing.
  fileSize: bigint("file_size", { mode: "number" }).notNull(), // Original file size in bytes
  mimeType: varchar("mime_type", { length: 100 }),
  encrypted: boolean("encrypted").default(true).notNull(),
  encryptionMode: varchar("encryption_mode", { length: 15 }).default("chunked_gcm").notNull(), // "none" = unencrypted, "chunked_gcm" = streaming chunked encryption, "chunked_gcm_mp" = chunked multipart upload (no header)
  iv: varchar("iv", { length: 32 }).notNull(), // Hex-encoded initialization vector (16 bytes = 32 hex chars)
  authTag: varchar("auth_tag", { length: 32 }), // Only for GCM mode (nullable for CTR)
  thumbnailKey: text("thumbnail_key"), // Path to thumbnail in R2 (for images/videos) - null means no thumbnail
  thumbnailAttempted: boolean("thumbnail_attempted").default(false).notNull(), // Whether thumbnail generation was attempted (prevents retries on failure)
  isStarred: boolean("is_starred").default(false).notNull(), // Whether the file is starred by the user
  sourceShareLinkId: text("source_share_link_id"), // If saved from a share link, the share link ID
  sourceShareType: varchar("source_share_type", { length: 10 }), // "personal" or "team"
  isAgentUpload: boolean("is_agent_upload").default(false).notNull(), // true = Agent Storage tab, false = My Drive
  uploadedVia: text("uploaded_via"), // agentApiKey.id that uploaded the file (nullable)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cloud_files_user").on(table.userId, table.createdAt), // User files with time ordering
  index("idx_cloud_files_user_key").on(table.userId, table.fileKey), // Lookup user file by key
  index("idx_cloud_files_source_share").on(table.userId, table.sourceShareLinkId), // Find files saved from share links
  uniqueIndex("idx_cloud_files_source_share_unique").on(table.userId, table.sourceShareLinkId, table.sourceShareType).where(sql`${table.sourceShareLinkId} IS NOT NULL`), // One save per share link
  index("idx_cloud_files_agent").on(table.userId, table.isAgentUpload, table.createdAt), // Agent file listing
  // Folder-scoped listing. isAgentUpload first so the My Drive view (false) and the Agent view (true) are separate ranges.
  index("idx_cloud_files_folder").on(table.userId, table.isAgentUpload, table.folderPath, table.createdAt),
  index("idx_cloud_files_folder_name").on(table.userId, table.isAgentUpload, table.folderPath, table.fileName), // Keyset pagination by name within a folder
]);

export type CloudFile = typeof cloudFiles.$inferSelect;
export type NewCloudFile = typeof cloudFiles.$inferInsert;

/**
 * Folder catalog for the Bucket0 cloud drive (R2). Folders are first-class so
 * empty folders exist, sub-folder listing is a single indexed query, and folders
 * can carry metadata later. Kept in sync with R2 via the catalog chokepoint +
 * the reconciliation job. `path` and `parentPath` are relative to the user root
 * and end in "/"; top-level folders have parentPath "".
 */
export const cloudFolders = pgTable("cloud_folders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner
  path: text("path").notNull(), // Full path relative to user root, ending in "/", e.g. "maskG/360p/"
  parentPath: text("parent_path").default("").notNull(), // Parent directory, "" for top-level folders, e.g. "maskG/"
  name: varchar("name", { length: 500 }).notNull(), // Last path segment, e.g. "360p"
  isAgentUpload: boolean("is_agent_upload").default(false).notNull(), // Mirrors cloudFiles: keeps My Drive and Agent Storage folder trees separate
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_cloud_folders_user_path").on(table.userId, table.isAgentUpload, table.path), // One row per folder, per view (My Drive vs Agent Storage)
  index("idx_cloud_folders_parent").on(table.userId, table.isAgentUpload, table.parentPath, table.name), // List sub-folders of a path, name-ordered
]);

export type CloudFolder = typeof cloudFolders.$inferSelect;
export type NewCloudFolder = typeof cloudFolders.$inferInsert;

export const s3Configurations = pgTable("s3_configurations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID
  name: varchar("name", { length: 255 }).notNull(), // User-friendly name
  provider: varchar("provider", { length: 50 }).notNull(), // aws, r2, azure, digitalocean, backblaze, other
  bucketName: varchar("bucket_name", { length: 255 }).notNull(),
  region: varchar("region", { length: 100 }).notNull(),
  endpoint: varchar("endpoint", { length: 500 }), // Optional for non-AWS
  forcePathStyle: boolean("force_path_style").default(false).notNull(),
  // Encrypted credentials
  encryptedAccessKeyId: text("encrypted_access_key_id").notNull(), // AES-256-GCM encrypted
  encryptedSecretAccessKey: text("encrypted_secret_access_key").notNull(), // AES-256-GCM encrypted
  credentialsIv: varchar("credentials_iv", { length: 24 }).notNull(), // IV for credential encryption (12 bytes = 24 hex chars)
  credentialsAuthTag: varchar("credentials_auth_tag", { length: 64 }).notNull(), // Combined auth tags (2x 16 bytes = 64 hex chars)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type S3Configuration = typeof s3Configurations.$inferSelect;
export type NewS3Configuration = typeof s3Configurations.$inferInsert;

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID
  email: varchar("email", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // bug, feature, other
  message: text("message").notNull(),
  context: text("context"), // JSON string with page, userAgent, screenSize, etc.
  status: varchar("status", { length: 20 }).default("new").notNull(), // new, reviewed, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;

// ==================== CONTACT MESSAGES ====================

export const contactMessages = pgTable("contact_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 50 }).notNull(),
  message: text("message").notNull(),
  ip: varchar("ip", { length: 45 }), // for rate limiting reference
  status: varchar("status", { length: 20 }).default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewContactMessage = typeof contactMessages.$inferInsert;

// ==================== TEAM FILE STORAGE ====================

export const teamFiles = pgTable("team_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by").notNull(), // Clerk ID of uploader
  fileKey: text("file_key").notNull(), // File path in R2 (teams/{teamId}/filename)
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(), // Original file size in bytes
  mimeType: varchar("mime_type", { length: 100 }),
  encrypted: boolean("encrypted").default(true).notNull(),
  encryptionMode: varchar("encryption_mode", { length: 15 }).default("chunked_gcm").notNull(),
  iv: varchar("iv", { length: 32 }).notNull(),
  authTag: varchar("auth_tag", { length: 32 }),
  thumbnailKey: text("thumbnail_key"),
  thumbnailAttempted: boolean("thumbnail_attempted").default(false).notNull(),
  isStarred: boolean("is_starred").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_team_files_team_created").on(table.teamId, table.createdAt),
  uniqueIndex("idx_team_files_team_key").on(table.teamId, table.fileKey),
  index("idx_team_files_uploader").on(table.uploadedBy, table.createdAt),
]);

export type TeamFile = typeof teamFiles.$inferSelect;
export type NewTeamFile = typeof teamFiles.$inferInsert;

// ==================== TEAM FILE SHARE LINKS ====================

export const teamShareLinks = pgTable("team_share_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(), // Clerk ID of member who created the link
  fileKey: text("file_key").notNull(), // File path in R2 (teams/{teamId}/filename)
  fileName: varchar("file_name", { length: 500 }).notNull(),
  accessType: varchar("access_type", { length: 20 }).default("anyone").notNull(), // "anyone" or "protected"
  isActive: boolean("is_active").default(true).notNull(),
  accessCount: integer("access_count").default(0).notNull(),
  allowDownload: boolean("allow_download").default(true).notNull(),
  allowAddToDrive: boolean("allow_add_to_drive").default(true).notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_team_share_links_team").on(table.teamId),
  index("idx_team_share_links_file").on(table.teamId, table.fileKey),
]);

export type TeamShareLink = typeof teamShareLinks.$inferSelect;
export type NewTeamShareLink = typeof teamShareLinks.$inferInsert;

// ==================== TEAM TABLES ====================

export const teams = pgTable("teams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: text("owner_id").notNull(), // Clerk ID of team owner
  storageUsage: bigint("storage_usage", { mode: "number" }).default(0).notNull(),
  fileCount: integer("file_count").default(0).notNull(),
  memberCount: integer("member_count").default(1).notNull(), // Includes owner
  polarSubscriptionId: text("polar_subscription_id"),
  polarCustomerId: text("polar_customer_id"),
  settings: text("settings"), // JSON for future settings
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_teams_owner").on(table.ownerId), // For getUserTeams() - list teams by owner
]);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export const teamRoles = pgTable("team_roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  // Permission bundle
  canUpload: boolean("can_upload").default(true).notNull(),
  canDownload: boolean("can_download").default(true).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  canShare: boolean("can_share").default(true).notNull(),
  canManageMembers: boolean("can_manage_members").default(false).notNull(),
  canViewActivity: boolean("can_view_activity").default(false).notNull(),
  canChat: boolean("can_chat").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_team_role_name").on(table.teamId, table.name),
  index("idx_team_roles_team").on(table.teamId), // For listing roles by team
]);

export type TeamRole = typeof teamRoles.$inferSelect;
export type NewTeamRole = typeof teamRoles.$inferInsert;

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), // Clerk ID
  roleId: text("role_id").references(() => teamRoles.id, { onDelete: "set null" }), // Optional: assigned role
  // Individual permissions (can override role)
  canUpload: boolean("can_upload").default(true).notNull(),
  canDownload: boolean("can_download").default(true).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  canShare: boolean("can_share").default(true).notNull(),
  canManageMembers: boolean("can_manage_members").default(false).notNull(),
  canViewActivity: boolean("can_view_activity").default(false).notNull(),
  canChat: boolean("can_chat").default(true).notNull(),
  invitedBy: text("invited_by"), // Clerk ID of inviter
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_team_member").on(table.teamId, table.userId),
  index("idx_team_members_team").on(table.teamId),
  index("idx_team_members_user").on(table.userId),
]);

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export const teamInvitations = pgTable("team_invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  roleId: text("role_id").references(() => teamRoles.id, { onDelete: "set null" }),
  invitedBy: text("invited_by").notNull(), // Clerk ID
  token: text("token").notNull().unique(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, accepted, rejected, expired
  // Default permissions for the invitee (used if no role assigned)
  canUpload: boolean("can_upload").default(true).notNull(),
  canDownload: boolean("can_download").default(true).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  canShare: boolean("can_share").default(true).notNull(),
  canManageMembers: boolean("can_manage_members").default(false).notNull(),
  canViewActivity: boolean("can_view_activity").default(false).notNull(),
  canChat: boolean("can_chat").default(true).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  resendCount: integer("resend_count").default(0).notNull(),
  lastResentAt: timestamp("last_resent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_team_invitations_team_status").on(table.teamId, table.status), // For listing pending invitations
  index("idx_team_invitations_team_email").on(table.teamId, table.email), // For duplicate check
]);

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;

export const activityLogs = pgTable("activity_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), // Actor who performed the action
  action: varchar("action", { length: 50 }).notNull(), // file.upload, file.download, member.join, etc.
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // file, member, team, role
  resourceId: text("resource_id"), // ID of the affected resource
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON for additional context
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_activity_logs_team").on(table.teamId, table.createdAt), // Team activity feed
  index("idx_activity_logs_user").on(table.userId, table.createdAt), // User activity across teams
  index("idx_activity_logs_resource").on(table.teamId, table.resourceId, table.createdAt), // File/resource history
  index("idx_activity_logs_action").on(table.teamId, table.action, table.createdAt), // Filter by action type
]);

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export const teamMessages = pgTable("team_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), // Sender
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).default("text").notNull(), // text, file_comment, system
  fileId: text("file_id"), // For file comments
  parentId: text("parent_id"), // For threaded replies
  isEdited: boolean("is_edited").default(false).notNull(),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_team_messages_team").on(table.teamId, table.createdAt), // Team message feed
  index("idx_team_messages_file").on(table.teamId, table.fileId, table.createdAt), // File comments
  index("idx_team_messages_thread").on(table.teamId, table.parentId, table.createdAt), // Thread replies
]);

export type TeamMessage = typeof teamMessages.$inferSelect;
export type NewTeamMessage = typeof teamMessages.$inferInsert;

// ==================== S3 API CREDENTIALS ====================

export const s3ApiCredentials = pgTable("s3_api_credentials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner of the credential
  accessKeyId: varchar("access_key_id", { length: 20 }).notNull().unique(), // B0IAXXXXXXXXXXXXXXXX
  // Encrypted secret key (AES-256-GCM) - required for AWS Signature v4 verification
  encryptedSecretKey: text("encrypted_secret_key").notNull(),
  secretKeyIv: text("secret_key_iv").notNull(), // 12-byte IV (hex)
  secretKeyAuthTag: text("secret_key_auth_tag").notNull(), // GCM auth tag (hex)
  name: varchar("name", { length: 100 }).notNull(), // User-friendly label
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_s3_api_credentials_user").on(table.userId),
  index("idx_s3_api_credentials_access_key").on(table.accessKeyId),
]);

export type S3ApiCredential = typeof s3ApiCredentials.$inferSelect;
export type NewS3ApiCredential = typeof s3ApiCredentials.$inferInsert;

// ==================== S3 API BUCKETS ====================

export const s3ApiBuckets = pgTable("s3_api_buckets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner of the bucket
  bucketName: varchar("bucket_name", { length: 63 }).notNull(), // S3 bucket naming conventions
  storageUsed: bigint("storage_used", { mode: "number" }).default(0).notNull(), // Cached from R2
  objectCount: integer("object_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_s3_api_bucket_user").on(table.userId, table.bucketName),
  index("idx_s3_api_buckets_user").on(table.userId),
]);

export type S3ApiBucket = typeof s3ApiBuckets.$inferSelect;
export type NewS3ApiBucket = typeof s3ApiBuckets.$inferInsert;

// Short-lived lock per S3 object so concurrent PutObject/DeleteObject on one key apply their quota change once
export const s3ObjectLeases = pgTable("s3_object_leases", {
  userId: text("user_id").notNull(),
  bucketName: varchar("bucket_name", { length: 63 }).notNull(),
  objectKey: text("object_key").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bucketName, table.objectKey] }),
]);

// ==================== AGENT API KEYS ====================

export const agentApiKeys = pgTable("agent_api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner of the key
  name: varchar("name", { length: 100 }).notNull(), // User-friendly label (e.g., "my-coding-agent")
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(), // First 8 chars for display (e.g., "b0ak_a3F...")
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(), // SHA-256 hash of full key for lookup
  destination: varchar("destination", { length: 10 }).default("agent").notNull(), // "agent" = Agent Storage, "drive" = My Drive
  destinationFolder: text("destination_folder"), // Target folder when destination="drive" (e.g., "ai-uploads/"). Null = root.
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_agent_api_keys_user").on(table.userId),
  index("idx_agent_api_keys_hash").on(table.keyHash),
]);

export type AgentApiKey = typeof agentApiKeys.$inferSelect;
export type NewAgentApiKey = typeof agentApiKeys.$inferInsert;

// ==================== AGENTBUCKET MEMORY ====================

/**
 * Semantic memory chunks for AgentBucket+. Text uploads on memory-eligible plans
 * (unless the agent sends index=false) are chunked, embedded, and stored here.
 * Chunk text is encrypted at rest (AES-256-GCM, CREDENTIAL_ENCRYPTION_KEY).
 * Rows cascade-delete with their cloudFiles row. Embedding dimension must match
 * EMBEDDING_DIMENSIONS (default 1536); changing the model requires a migration.
 */
export const memoryChunks = pgTable("memory_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(), // Clerk ID - owner
  fileId: text("file_id").notNull().references(() => cloudFiles.id, { onDelete: "cascade" }), // Source file
  keyId: text("key_id"), // agentApiKeys.id that produced this chunk (nullable)
  chunkIndex: integer("chunk_index").notNull(), // Position within the file
  content: text("content").notNull(), // Encrypted chunk text (base64 ciphertext)
  contentIv: varchar("content_iv", { length: 24 }).notNull(), // 12-byte IV (hex)
  contentAuthTag: varchar("content_auth_tag", { length: 32 }).notNull(), // GCM auth tag (hex)
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  tokenCount: integer("token_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_memory_chunks_user_file").on(table.userId, table.fileId), // Per-file chunks + user-scoped counts
  // HNSW cosine index for approximate nearest-neighbour search
  index("idx_memory_chunks_embedding").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export type MemoryChunk = typeof memoryChunks.$inferSelect;
export type NewMemoryChunk = typeof memoryChunks.$inferInsert;
