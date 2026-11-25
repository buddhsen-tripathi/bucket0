/**
 * S3 API Storage Service
 *
 * Handles R2 storage operations for the S3-compatible API.
 * Files are stored at: s3/{userId}/{bucketName}/{key}
 *
 * Unlike regular cloud storage, S3 API files are NOT encrypted
 * to support standard S3 range requests and SDK compatibility.
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CompletedPart,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Read lazily: Workers evaluate modules before secrets are bound.
const R2 = {
  get ACCOUNT_ID() {
    return process.env.R2_ACCOUNT_ID;
  },
  get ACCESS_KEY_ID() {
    return process.env.R2_ACCESS_KEY_ID;
  },
  get SECRET_ACCESS_KEY() {
    return process.env.R2_SECRET_ACCESS_KEY;
  },
  get BUCKET_NAME() {
    return process.env.R2_BUCKET_NAME;
  },
};

// R2 configuration

// HMR-safe singleton S3Client
const globalForS3Api = globalThis as unknown as {
  s3ApiClient: S3Client | undefined;
};

function getClient(): S3Client {
  if (globalForS3Api.s3ApiClient) {
    return globalForS3Api.s3ApiClient;
  }

  if (!R2.ACCOUNT_ID || !R2.ACCESS_KEY_ID || !R2.SECRET_ACCESS_KEY || !R2.BUCKET_NAME) {
    throw new Error("R2 configuration is missing for S3 API");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2.ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2.ACCESS_KEY_ID,
      secretAccessKey: R2.SECRET_ACCESS_KEY,
    },
  });

  globalForS3Api.s3ApiClient = client;
  return client;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface ListResult {
  objects: S3Object[];
  prefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export class S3ApiStorageService {
  /**
   * Build the R2 key for S3 API storage
   * Format: s3/{userId}/{bucketName}/{objectKey}
   */
  private buildKey(userId: string, bucketName: string, objectKey: string): string {
    // Dot segments could resolve outside s3/{userId}/{bucketName}/ in transit.
    if (`${bucketName}/${objectKey}`.split("/").some(segment => segment === "." || segment === "..")) {
      throw new Error("Invalid object key");
    }
    return `s3/${userId}/${bucketName}/${objectKey}`;
  }

  /**
   * Build the R2 prefix for listing
   */
  private buildPrefix(userId: string, bucketName: string, prefix?: string): string {
    const base = `s3/${userId}/${bucketName}/`;
    return prefix ? base + prefix : base;
  }

  /**
   * Strip the internal prefix from an R2 key to get the user-facing key
   */
  private stripPrefix(key: string, userId: string, bucketName: string): string {
    const prefix = `s3/${userId}/${bucketName}/`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  /**
   * Check if a virtual bucket exists (has any objects)
   */
  async headBucket(userId: string, bucketName: string): Promise<boolean> {
    const client = getClient();
    const prefix = this.buildPrefix(userId, bucketName);

    try {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1,
      });

      const response = await client.send(command);
      // Bucket "exists" if we can list it (prefix exists or is valid)
      // For virtual buckets, we consider them always existing if the user has access
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List objects in a virtual bucket
   */
  async listObjects(
    userId: string,
    bucketName: string,
    options?: {
      prefix?: string;
      delimiter?: string;
      maxKeys?: number;
      continuationToken?: string;
    }
  ): Promise<ListResult> {
    const client = getClient();
    const fullPrefix = this.buildPrefix(userId, bucketName, options?.prefix);

    const command = new ListObjectsV2Command({
      Bucket: R2.BUCKET_NAME,
      Prefix: fullPrefix,
      Delimiter: options?.delimiter,
      MaxKeys: options?.maxKeys || 1000,
      ContinuationToken: options?.continuationToken,
    });

    const response = await client.send(command);

    const objects: S3Object[] = (response.Contents || []).map(obj => ({
      key: this.stripPrefix(obj.Key || "", userId, bucketName),
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      etag: obj.ETag || "",
    }));

    const prefixes = (response.CommonPrefixes || []).map(p =>
      this.stripPrefix(p.Prefix || "", userId, bucketName)
    );

    return {
      objects,
      prefixes,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  /**
   * Get object metadata (HeadObject)
   */
  async headObject(userId: string, bucketName: string, objectKey: string): Promise<{
    contentLength: number;
    contentType: string;
    etag: string;
    lastModified: Date;
  } | null> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    try {
      const command = new HeadObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: key,
      });

      const response = await client.send(command);

      return {
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
        etag: response.ETag || "",
        lastModified: response.LastModified || new Date(),
      };
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === "NotFound") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get object (download)
   */
  async getObject(
    userId: string,
    bucketName: string,
    objectKey: string,
    range?: string
  ): Promise<{
    body: Readable;
    contentLength: number;
    contentType: string;
    contentRange?: string;
    etag: string;
    lastModified: Date;
  } | null> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    try {
      const command = new GetObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: key,
        Range: range,
      });

      const response = await client.send(command);

      // Convert the body to a Node.js Readable stream
      const body = response.Body as Readable;

      return {
        body,
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
        contentRange: response.ContentRange,
        etag: response.ETag || "",
        lastModified: response.LastModified || new Date(),
      };
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === "NoSuchKey") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Put object (upload) - unencrypted for S3 compatibility
   */
  async putObject(
    userId: string,
    bucketName: string,
    objectKey: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number
  ): Promise<{ etag: string; size: number }> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    // For Buffer, use actual length; for streams, use provided contentLength
    const actualLength = body instanceof Buffer ? body.length : contentLength;

    const command = new PutObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Only pass ContentLength if we have a definitive value
      ...(actualLength !== undefined && actualLength > 0 ? { ContentLength: actualLength } : {}),
    });

    const response = await client.send(command);

    return {
      etag: response.ETag || "",
      size: actualLength || 0,
    };
  }

  /**
   * Delete object
   */
  async deleteObject(userId: string, bucketName: string, objectKey: string): Promise<boolean> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    try {
      const command = new DeleteObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all objects in a bucket
   * Returns total bytes deleted for quota adjustment
   */
  async deleteAllObjects(userId: string, bucketName: string): Promise<{
    deletedCount: number;
    totalBytesDeleted: number;
  }> {
    const client = getClient();
    let deletedCount = 0;
    let totalBytesDeleted = 0;
    let continuationToken: string | undefined;

    do {
      // List objects in batches
      const listResult = await this.listObjects(userId, bucketName, {
        maxKeys: 1000,
        continuationToken,
      });

      if (listResult.objects.length === 0) {
        break;
      }

      // Calculate total size before deletion
      for (const obj of listResult.objects) {
        totalBytesDeleted += obj.size;
      }

      // Build keys for batch deletion
      const keysToDelete = listResult.objects.map(obj => ({
        Key: this.buildKey(userId, bucketName, obj.key),
      }));

      // Batch delete (up to 1000 at a time)
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: R2.BUCKET_NAME,
        Delete: {
          Objects: keysToDelete,
          Quiet: true,
        },
      });

      await client.send(deleteCommand);
      deletedCount += listResult.objects.length;

      continuationToken = listResult.isTruncated ? listResult.nextContinuationToken : undefined;
    } while (continuationToken);

    return { deletedCount, totalBytesDeleted };
  }

  /**
   * Delete specific keys in one batch (max 1000). Returns the keys R2 reported as failed.
   */
  async deleteObjects(userId: string, bucketName: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const client = getClient();
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: R2.BUCKET_NAME,
      Delete: { Objects: keys.map((key) => ({ Key: this.buildKey(userId, bucketName, key) })), Quiet: true },
    }));
    return new Set((response.Errors || []).map((error) => this.stripPrefix(error.Key || "", userId, bucketName)));
  }

  /**
   * Get object size (for quota calculations)
   */
  async getObjectSize(userId: string, bucketName: string, objectKey: string): Promise<number> {
    const metadata = await this.headObject(userId, bucketName, objectKey);
    return metadata?.contentLength || 0;
  }

  // ==========================================
  // Multipart Upload Methods
  // ==========================================

  /**
   * Create multipart upload
   */
  async createMultipartUpload(
    userId: string,
    bucketName: string,
    objectKey: string,
    contentType: string
  ): Promise<string> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    const command = new CreateMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const response = await client.send(command);

    if (!response.UploadId) {
      throw new Error("Failed to create multipart upload");
    }

    return response.UploadId;
  }

  /**
   * Upload part
   */
  async uploadPart(
    userId: string,
    bucketName: string,
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<string> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    const command = new UploadPartCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    });

    const response = await client.send(command);

    if (!response.ETag) {
      throw new Error(`Failed to upload part ${partNumber}`);
    }

    return response.ETag;
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    userId: string,
    bucketName: string,
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<{ etag: string }> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    const command = new CompleteMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    const response = await client.send(command);

    return {
      etag: response.ETag || "",
    };
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(
    userId: string,
    bucketName: string,
    objectKey: string,
    uploadId: string
  ): Promise<void> {
    const client = getClient();
    const key = this.buildKey(userId, bucketName, objectKey);

    const command = new AbortMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await client.send(command);
  }

  /**
   * Calculate total storage used by a user's S3 API buckets
   */
  async calculateUserStorageUsed(userId: string): Promise<number> {
    const client = getClient();
    const prefix = `s3/${userId}/`;

    let totalSize = 0;
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      for (const obj of response.Contents || []) {
        totalSize += obj.Size || 0;
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return totalSize;
  }

  /**
   * Calculate storage used by a specific bucket
   */
  async calculateBucketStorageUsed(userId: string, bucketName: string): Promise<{
    storageUsed: number;
    objectCount: number;
  }> {
    const client = getClient();
    const prefix = this.buildPrefix(userId, bucketName);

    let totalSize = 0;
    let objectCount = 0;
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      for (const obj of response.Contents || []) {
        totalSize += obj.Size || 0;
        objectCount++;
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { storageUsed: totalSize, objectCount };
  }
}

export const s3ApiStorageService = new S3ApiStorageService();
