/**
 * Team-related types
 * Types for team files, members, and permissions
 */

import { BaseFileObject } from "./shared";

/** Team file object from R2 storage */
export interface TeamFileObject extends BaseFileObject {
  /** Whether file has a thumbnail */
  hasThumbnail: boolean;
  /** MIME type */
  mimeType: string | null;
  /** Whether the file is starred */
  isStarred: boolean;
  /** Clerk ID of the uploader */
  uploadedBy: string;
  /** Database record ID */
  id: string;
}

/** Response from GET /api/teams/[teamId]/files */
export interface TeamFilesResponse {
  files: TeamFileObject[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  usage: number;
  usageFormatted: string;
  fileCount: number;
}

/** Team member info returned by the members API */
export interface TeamMemberInfo {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  isOwner: boolean;
  joinedAt: string;
  permissions: TeamPermissions;
}

/** Permission flags for a team member */
export interface TeamPermissions {
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canShare: boolean;
  canManageMembers: boolean;
  canViewActivity: boolean;
  canChat: boolean;
}

/** Summary of a team for listing */
export interface TeamListItem {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  storageUsage: number;
  fileCount: number;
  memberCount: number;
  createdAt: string;
  isOwner: boolean;
}
