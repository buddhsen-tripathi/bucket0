import { S3Config, S3FileObject } from "@/lib/shared/types";

export type { S3Config, S3FileObject };

interface ListFilesOptions {
  /** Filter by prefix (folder path) */
  prefix?: string;
  /** Max files per request (default 1000) */
  maxKeys?: number;
  /** Load all files automatically (handles pagination) */
  loadAll?: boolean;
}

/** Raw file object from API (JSON serialized dates as strings) */
interface RawS3FileObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  isFolder?: boolean;
}

interface ListFilesResponse {
  files: RawS3FileObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  totalLoaded: number;
}

// Client-side service that calls our API endpoints
export class S3Service {
  private config: S3Config | null = null;

  configure(config: S3Config) {
    // Sanitize credentials - trim whitespace/newlines that might have been accidentally copied
    const sanitizedConfig = {
      ...config,
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
      bucketName: config.bucketName.trim(),
      region: config.region.trim(),
      endpoint: config.endpoint?.trim(),
    };

    // Auto-detect forcePathStyle based on endpoint
    if (sanitizedConfig.endpoint && !sanitizedConfig.forcePathStyle) {
      // Most non-AWS S3-compatible services need forcePathStyle
      // AWS S3 typically doesn't need it
      const isAwsEndpoint =
        sanitizedConfig.endpoint.includes("amazonaws.com") || !sanitizedConfig.endpoint;
      sanitizedConfig.forcePathStyle = !isAwsEndpoint;
    }

    this.config = sanitizedConfig;
    return this;
  }

  /**
   * List files from the bucket
   * By default loads ALL files using server-side pagination
   */
  async listFiles(options: ListFilesOptions = {}): Promise<S3FileObject[]> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    const { prefix, maxKeys, loadAll = true } = options;

    try {
      const response = await fetch("/api/s3/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: this.config,
          prefix,
          maxKeys,
          loadAll, // Let server handle pagination and return all files
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to load your files. Please check your bucket configuration.");
      }

      const data: ListFilesResponse = await response.json();
      return data.files.map((file: RawS3FileObject): S3FileObject => ({
        ...file,
        lastModified: new Date(file.lastModified),
      }));
    } catch (error) {
      console.error("Error listing files:", error);
      throw error;
    }
  }

  /**
   * List files with manual pagination control
   * Use this for progressive loading UI
   */
  async listFilesPaginated(
    options: { prefix?: string; maxKeys?: number; continuationToken?: string } = {}
  ): Promise<ListFilesResponse> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    const { prefix, maxKeys = 1000, continuationToken } = options;

    try {
      const response = await fetch("/api/s3/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: this.config,
          prefix,
          maxKeys,
          continuationToken,
          loadAll: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to load your files. Please check your bucket configuration.");
      }

      const data = await response.json();
      return {
        files: data.files.map(
          (file: {
            key: string;
            size: number;
            lastModified: string;
            etag: string;
          }) => ({
            ...file,
            lastModified: new Date(file.lastModified),
          })
        ),
        isTruncated: data.isTruncated,
        nextContinuationToken: data.nextContinuationToken,
        totalLoaded: data.totalLoaded,
      };
    } catch (error) {
      console.error("Error listing files:", error);
      throw error;
    }
  }

  async createFolder(folderName: string): Promise<void> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      // Ensure folder name ends with a slash
      const key = folderName.endsWith("/") ? folderName : `${folderName}/`;

      const response = await fetch("/api/s3/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: this.config,
          key: key,
          isEmptyFolder: true
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create folder. Please try again.");
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      throw error;
    }
  }

  async uploadFile(file: File): Promise<string> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("config", JSON.stringify(this.config));

      const response = await fetch("/api/s3/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Unable to upload file. Please try again.");
      }

      const data = await response.json();
      return data.key;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: this.config, key }),
      });

      if (!response.ok) {
        throw new Error("Unable to delete file. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      const response = await fetch("/api/s3/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: this.config, key, expiresIn }),
      });

      if (!response.ok) {
        throw new Error("Unable to download file. Please try again.");
      }

      const data = await response.json();
      return data.downloadUrl;
    } catch (error) {
      console.error("Error generating download URL:", error);
      throw error;
    }
  }

  async getViewUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      const response = await fetch("/api/s3/view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: this.config, key, expiresIn }),
      });

      if (!response.ok) {
        throw new Error("Unable to preview file. Please try again.");
      }

      const data = await response.json();
      return data.viewUrl;
    } catch (error) {
      console.error("Error generating view URL:", error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error("S3 service not configured");
    }

    try {
      const response = await fetch("/api/s3/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: this.config }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error("Connection test failed:", error);
      return false;
    }
  }

  getConfig(): S3Config | null {
    return this.config;
  }
}

// Singleton instance
export const s3Service = new S3Service();
