/**
 * Cloud storage types (internal R2 storage)
 * These types are specific to Bucket0's cloud storage features
 */

import { BaseFileObject } from "./shared";

/** Cloud file object returned from /api/cloud/files */
export interface CloudFileObject extends BaseFileObject {
  /** Whether the file has a generated thumbnail */
  hasThumbnail?: boolean;
  /** MIME type of the file */
  mimeType?: string | null;
  /** Whether the file is starred by the user */
  isStarred?: boolean;
}

/** Display item for file list UI (includes computed properties) */
export interface CloudDisplayItem extends CloudFileObject {
  /** Display name (filename without path) */
  name: string;
  /** Whether this item is a directory/folder */
  isDirectory: boolean;
  /** ETag from R2 (optional, may not be present for folders) */
  etag?: string;
}

/** Cloud file upload options */
export interface CloudUploadOptions {
  /** Skip encryption for this file */
  skipEncryption?: boolean;
  /** Custom metadata to attach */
  metadata?: Record<string, string>;
  /** Folder path (without leading/trailing slashes) */
  folder?: string;
}

/** Cloud file response from API */
export interface CloudFilesResponse {
  files: CloudFileObject[];
  usage: number;
  limit: number;
  plan: string;
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Star toggle request */
export interface StarRequest {
  key: string;
  starred: boolean;
}

/** Star toggle response */
export interface StarResponse {
  success: boolean;
  key: string;
  isStarred: boolean;
}
