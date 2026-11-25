import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2CommandOutput,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CompletedPart,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  get CUSTOM_DOMAIN() {
    return process.env.R2_CUSTOM_DOMAIN;
  },
};

// This service runs ONLY on the server-side

// HMR-safe singleton S3Client (same pattern as chunked-upload-tracker.ts)
const globalForS3 = globalThis as unknown as {
  systemS3Client: S3Client | undefined;
};

const getSystemClient = (): S3Client => {
  if (globalForS3.systemS3Client) {
    return globalForS3.systemS3Client;
  }

  if (!R2.ACCOUNT_ID || !R2.ACCESS_KEY_ID || !R2.SECRET_ACCESS_KEY || !R2.BUCKET_NAME) {
    throw new Error("System R2 configuration is missing");
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

  globalForS3.systemS3Client = client;
  return client;
};

export class SystemStorageService {
  private getClient() {
    return getSystemClient();
  }

  private getUserPrefix(userId: string) {
    return `users/${userId}/`;
  }

  /** Operator readiness check: read at most one byte, never write storage objects. */
  async checkReadAccess() {
    const client = this.getClient();
    const listed = await client.send(new ListObjectsV2Command({ Bucket: R2.BUCKET_NAME, MaxKeys: 1 }));
    const sample = listed.Contents?.[0];
    const key = sample?.Key;
    if (!key) return { objectRead: "empty-bucket" };
    if (sample.Size === 0) {
      await client.send(new HeadObjectCommand({ Bucket: R2.BUCKET_NAME, Key: key }));
      return { objectRead: "empty-object" };
    }
    const object = await client.send(new GetObjectCommand({ Bucket: R2.BUCKET_NAME, Key: key, Range: "bytes=0-0" }));
    if (!object.Body) throw new Error("R2 returned no object body");
    const reader = object.Body.transformToWebStream().getReader();
    try {
      let bytes = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > 1) throw new Error("R2 ignored the readiness range");
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return { objectRead: "verified" };
  }

  async listFiles(userId: string) {
    const client = this.getClient();
    const prefix = this.getUserPrefix(userId);

    let continuationToken: string | undefined = undefined;
    // Use the type from the command output, defaulting to empty array type if undefined (though we ensure it's an array)
    const allContents: NonNullable<ListObjectsV2CommandOutput['Contents']> = [];

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command) as ListObjectsV2CommandOutput;
      if (response.Contents) {
        allContents.push(...response.Contents);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return allContents
      .map((item) => ({
        key: item.Key?.replace(prefix, "") || "", // Strip prefix for client view
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        etag: item.ETag || "",
      }));
  }

  async getUploadUrl(userId: string, fileName: string, contentType: string) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // ContentLength: size, // Disabled to avoid browser header mismatch issues
    });

    // Generate a presigned URL for the client to upload directly
    return await getSignedUrl(client, command, { expiresIn: 3600 });
  }

  async uploadFile(userId: string, fileName: string, body: Buffer, contentType: string) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    return await client.send(command);
  }

  /**
   * Upload a file using streaming (memory efficient for large files)
   * Uses AWS SDK's managed upload with multipart support
   */
  async uploadFileStream(
    userId: string,
    fileName: string,
    body: Readable | ReadableStream,
    contentType: string,
    contentLength?: number
  ) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    // Convert Web ReadableStream to Node.js Readable if needed
    const nodeStream = body instanceof Readable
      ? body
      : Readable.fromWeb(body as import("stream/web").ReadableStream);

    const upload = new Upload({
      client,
      params: {
        Bucket: R2.BUCKET_NAME!,
        Key: key,
        Body: nodeStream,
        ContentType: contentType,
        ...(contentLength && { ContentLength: contentLength }),
      },
      // Multipart upload settings
      queueSize: 4, // Concurrent part uploads
      partSize: 10 * 1024 * 1024, // 10MB parts
      leavePartsOnError: false, // Clean up on failure
    });

    return await upload.done();
  }

  async getFileSize(userId: string, fileName: string): Promise<number> {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    try {
      const command = new HeadObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: key,
      });

      const response = await client.send(command);
      return response.ContentLength || 0;
    } catch {
      return 0;
    }
  }

  async deleteFile(userId: string, fileName: string) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new DeleteObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
  }

  /** keepKeys: full object keys under the prefix to leave in place (e.g. Agent Storage files). */
  async deleteFolder(userId: string, folderName: string, keepKeys: ReadonlySet<string> = new Set()) {
    const client = this.getClient();
    // Ensure folder path has trailing slash and is properly prefixed
    const folderPrefix = `${this.getUserPrefix(userId)}${folderName}`;
    
    // 1. List all objects with this prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: R2.BUCKET_NAME,
      Prefix: folderPrefix,
    });

    const listResponse = await client.send(listCommand);
    const objects = (listResponse.Contents || []).filter((obj) => !obj.Key || !keepKeys.has(obj.Key));

    if (objects.length === 0) return 0;

    // Calculate total size and count
    const totalSize = objects.reduce((acc, obj) => acc + (obj.Size || 0), 0);
    const count = objects.filter(obj => !obj.Key?.endsWith("/")).length;

    // 2. Delete objects in batches of 1000
    const objectsToDelete = objects.map(obj => ({ Key: obj.Key }));
    
    // Simple batching for < 1000 items (expand if needed for larger folders)
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: R2.BUCKET_NAME,
      Delete: {
        Objects: objectsToDelete,
        Quiet: true,
      },
    });

    await client.send(deleteCommand);
    return { totalSize, count };
  }

  async getDownloadUrl(userId: string, fileName: string) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn: 3600 });
  }

  async getViewUrl(userId: string, fileName: string) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: 'inline',
    });

    return await getSignedUrl(client, command, { expiresIn: 300 }); // 5 minutes link is enough for redirect
  }

  async getFileStream(userId: string, fileName: string, range?: string, abortSignal?: AbortSignal) {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ...(range && { Range: range }),
    });

    return await client.send(command, { abortSignal });
  }

  // Get public URL using custom domain (for public buckets)
  getPublicUrl(userId: string, fileName: string): string | null {
    if (!R2.CUSTOM_DOMAIN) return null;
    const key = `${this.getUserPrefix(userId)}${fileName}`;
    return `https://${R2.CUSTOM_DOMAIN}/${key}`;
  }

  // Check if custom domain is configured
  hasCustomDomain(): boolean {
    return !!R2.CUSTOM_DOMAIN;
  }

  // ==========================================
  // Multipart Upload Methods (Client-side chunked uploads)
  // ==========================================

  /**
   * Initialize a multipart upload
   * Returns uploadId to be used for subsequent part uploads
   */
  async createMultipartUpload(
    userId: string,
    fileName: string,
    contentType: string,
    uploadToken?: string
  ): Promise<string> {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ...(uploadToken && { Metadata: { "upload-token": uploadToken } }),
    });

    const response = await client.send(command);

    if (!response.UploadId) {
      throw new Error("Failed to create multipart upload");
    }

    return response.UploadId;
  }

  async getFileMetadata(userId: string, fileName: string) {
    try {
      return await this.getClient().send(new HeadObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: `${this.getUserPrefix(userId)}${fileName}`,
      }));
    } catch (error) {
      if (error instanceof Error && ["NotFound", "NoSuchKey"].includes(error.name)) return null;
      throw error;
    }
  }

  /**
   * Upload a single part of a multipart upload
   * Returns the ETag which is required for completing the upload
   */
  async uploadPart(
    userId: string,
    fileName: string,
    uploadId: string,
    partNumber: number,
    body: Buffer
  ): Promise<string> {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

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
   * Complete a multipart upload by providing all part ETags
   */
  async completeMultipartUpload(
    userId: string,
    fileName: string,
    uploadId: string,
    parts: CompletedPart[]
  ): Promise<void> {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new CompleteMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    await client.send(command);
  }

  /**
   * Abort a multipart upload (cleanup on failure)
   */
  async abortMultipartUpload(
    userId: string,
    fileName: string,
    uploadId: string
  ): Promise<void> {
    const client = this.getClient();
    const key = `${this.getUserPrefix(userId)}${fileName}`;

    const command = new AbortMultipartUploadCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await client.send(command);
  }

  // ==========================================
  // Team Storage Methods
  // Files are stored under teams/{teamId}/ prefix
  // ==========================================

  private getTeamPrefix(teamId: string) {
    return `teams/${teamId}/`;
  }

  async listTeamFiles(teamId: string) {
    const client = this.getClient();
    const prefix = this.getTeamPrefix(teamId);

    let continuationToken: string | undefined = undefined;
    const allContents: NonNullable<ListObjectsV2CommandOutput['Contents']> = [];

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command) as ListObjectsV2CommandOutput;
      if (response.Contents) {
        allContents.push(...response.Contents);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return allContents
      .map((item) => ({
        key: item.Key?.replace(prefix, "") || "",
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        etag: item.ETag || "",
      }));
  }

  async uploadTeamFile(teamId: string, fileName: string, body: Buffer, contentType: string) {
    const client = this.getClient();
    const key = `${this.getTeamPrefix(teamId)}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    return await client.send(command);
  }

  async uploadTeamFileStream(
    teamId: string,
    fileName: string,
    body: Readable | ReadableStream,
    contentType: string,
    contentLength?: number
  ) {
    const client = this.getClient();
    const key = `${this.getTeamPrefix(teamId)}${fileName}`;

    const nodeStream = body instanceof Readable
      ? body
      : Readable.fromWeb(body as import("stream/web").ReadableStream);

    const upload = new Upload({
      client,
      params: {
        Bucket: R2.BUCKET_NAME!,
        Key: key,
        Body: nodeStream,
        ContentType: contentType,
        ...(contentLength && { ContentLength: contentLength }),
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });

    return await upload.done();
  }

  async getTeamFileSize(teamId: string, fileName: string): Promise<number> {
    const client = this.getClient();
    const key = `${this.getTeamPrefix(teamId)}${fileName}`;

    try {
      const command = new HeadObjectCommand({
        Bucket: R2.BUCKET_NAME,
        Key: key,
      });

      const response = await client.send(command);
      return response.ContentLength || 0;
    } catch {
      return 0;
    }
  }

  async deleteTeamFile(teamId: string, fileName: string) {
    const client = this.getClient();
    const key = `${this.getTeamPrefix(teamId)}${fileName}`;

    const command = new DeleteObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
  }

  async deleteTeamFolder(teamId: string, folderName: string) {
    const client = this.getClient();
    const folderPrefix = `${this.getTeamPrefix(teamId)}${folderName}`;

    const listCommand = new ListObjectsV2Command({
      Bucket: R2.BUCKET_NAME,
      Prefix: folderPrefix,
    });

    const listResponse = await client.send(listCommand);
    const objects = listResponse.Contents || [];

    if (objects.length === 0) return { totalSize: 0, count: 0 };

    const totalSize = objects.reduce((acc, obj) => acc + (obj.Size || 0), 0);
    const count = objects.filter(obj => !obj.Key?.endsWith("/")).length;

    const objectsToDelete = objects.map(obj => ({ Key: obj.Key }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: R2.BUCKET_NAME,
      Delete: {
        Objects: objectsToDelete,
        Quiet: true,
      },
    });

    await client.send(deleteCommand);
    return { totalSize, count };
  }

  async deleteAllUserFiles(userId: string) {
    const client = this.getClient();
    const prefix = this.getUserPrefix(userId);

    let continuationToken: string | undefined = undefined;
    let totalSize = 0;
    let count = 0;

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command) as ListObjectsV2CommandOutput;
      const objects = response.Contents || [];

      if (objects.length > 0) {
        totalSize += objects.reduce((acc: number, obj) => acc + (obj.Size || 0), 0);
        count += objects.filter(obj => !obj.Key?.endsWith("/")).length;

        const objectsToDelete = objects.map(obj => ({ Key: obj.Key }));

        const deleteCmd = new DeleteObjectsCommand({
          Bucket: R2.BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });

        await client.send(deleteCmd);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { totalSize, count };
  }

  async deleteAllTeamFiles(teamId: string) {
    const client = this.getClient();
    const prefix = this.getTeamPrefix(teamId);

    let continuationToken: string | undefined = undefined;
    let totalSize = 0;
    let count = 0;

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command) as ListObjectsV2CommandOutput;
      const objects = response.Contents || [];

      if (objects.length > 0) {
        totalSize += objects.reduce((acc: number, obj) => acc + (obj.Size || 0), 0);
        count += objects.filter(obj => !obj.Key?.endsWith("/")).length;

        const objectsToDelete = objects.map(obj => ({ Key: obj.Key }));

        const deleteCmd = new DeleteObjectsCommand({
          Bucket: R2.BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });

        await client.send(deleteCmd);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { totalSize, count };
  }

  async getTeamFileStream(teamId: string, fileName: string, range?: string, signal?: AbortSignal) {
    const client = this.getClient();
    const key = `${this.getTeamPrefix(teamId)}${fileName}`;

    const command = new GetObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
      ...(range && { Range: range }),
    });

    return await client.send(command, signal ? { abortSignal: signal } : undefined);
  }

  /**
   * Copy an object within the same bucket (server-side, no data transfer)
   */
  async copyObject(sourceKey: string, destinationKey: string) {
    const client = this.getClient();
    await client.send(new CopyObjectCommand({
      Bucket: R2.BUCKET_NAME,
      CopySource: `${R2.BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey,
    }));
  }

  /**
   * Delete an object by its full key
   */
  async deleteByKey(key: string) {
    const client = this.getClient();
    await client.send(new DeleteObjectCommand({
      Bucket: R2.BUCKET_NAME,
      Key: key,
    }));
  }
}

export const systemStorage = new SystemStorageService();
