/**
 * External S3 storage types (user-connected buckets)
 * AWS, DigitalOcean Spaces, Backblaze B2, etc.
 */

import { BaseFileObject } from "./shared";

/** S3 bucket configuration */
export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/** S3 file object from external buckets */
export interface S3FileObject extends BaseFileObject {
  /** ETag from S3 */
  etag: string;
  /** Whether this is a folder (prefix) */
  isFolder?: boolean;
}

/** S3 display item for file list UI */
export interface S3DisplayItem extends S3FileObject {
  /** Display name (filename without path) */
  name: string;
  /** Whether this item is a directory/folder */
  isDirectory: boolean;
}

