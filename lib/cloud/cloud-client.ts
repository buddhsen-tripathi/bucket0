import { CloudFileObject } from "@/lib/shared/types";

// Store active uploads for cancellation
const activeUploads = new Map<string, AbortController>();

// Chunked upload threshold and settings
// IMPORTANT: CHUNK_SIZE must match server's encryption chunk size (8MB) for proper decryption
const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024; // 8MB
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks - aligned with server encryption chunks
const MAX_CONCURRENT_CHUNKS = 6; // Upload up to 6 chunks in parallel

interface ChunkedUploadState {
  uploadId: string;
  key: string;
  encrypt: boolean;
  aborted: boolean;
  size: number;
  isOverwrite: boolean;
}

// Store active chunked uploads for cancellation
const activeChunkedUploads = new Map<string, ChunkedUploadState>();

export type LimitErrorCode = "STORAGE_LIMIT" | "FILE_SIZE_LIMIT" | "FILE_COUNT_LIMIT";

export interface UploadLimitError {
  code: LimitErrorCode;
  message: string;
  details?: {
    storageLimit?: number;
    storageLimitFormatted?: string;
    storageUsage?: number;
    storageUsageFormatted?: string;
    remaining?: number;
    remainingFormatted?: string;
    maxFileSize?: number;
    maxFileSizeFormatted?: string;
    fileSize?: number;
    fileSizeFormatted?: string;
    plan?: string;
  };
}

export interface UserLimits {
  plan: string;
  storageUsage: number;
  storageLimit: number;
  storageUsageFormatted: string;
  storageLimitFormatted: string;
  maxFileSizeBytes: number;
  maxFileSizeFormatted: string;
  remainingStorage?: number;
  remainingStorageFormatted?: string;
}

export interface ValidationResult {
  allowed: boolean;
  isOverwrite?: boolean;
  error?: UploadLimitError;
  limits?: UserLimits;
}

export interface PaginationInfo {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ListFilesResponse {
  files: CloudFileObject[];
  usage: number;
  limit: number;
  plan: string;
  pagination: PaginationInfo;
}

export interface ListFilesOptions {
  limit?: number;
  offset?: number;
}

/** A sub-folder entry returned by /api/cloud/files/list. */
export interface FolderListItem {
  name: string;
  path: string; // relative to user root, ends in "/"
  createdAt: Date;
}

/** A page of the folder-scoped, offset-paginated listing (/api/cloud/files/list). */
export interface ListFolderResponse {
  path: string;
  folders: FolderListItem[];
  files: CloudFileObject[];
  pagination: {
    offset: number;
    limit: number;
    totalItems: number;
    hasMore: boolean;
  };
  sort: "name" | "size" | "modified";
  order: "asc" | "desc";
  usage: number;
  limit: number;
  plan: string;
}

export interface ListFolderOptions {
  offset?: number;
  limit?: number;
  sort?: "name" | "size" | "modified";
  order?: "asc" | "desc";
  /** Server hint (user-initiated refresh): also retry thumbnails whose prior
   *  generation attempt failed, for files in this page. */
  retryFailedThumbnails?: boolean;
  /** Global flat view of all starred files (ignores `path`); used by the Starred sub-view. */
  starred?: boolean;
  /** Global flat view of the most-recently-modified files (ignores `path`); used by the Recent sub-view. */
  recent?: boolean;
}

export class CloudClient {
  async listFiles(options?: ListFilesOptions): Promise<ListFilesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset !== undefined) params.set("offset", options.offset.toString());

    const url = `/api/cloud/files${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Unable to load your files. Please try again.");
    }
    const data = await response.json();
    return {
      files: data.files.map((file: { key: string; size: number; lastModified: string; etag: string; hasThumbnail?: boolean; mimeType?: string | null }) => ({
        ...file,
        lastModified: new Date(file.lastModified),
      })),
      usage: data.usage,
      limit: data.limit,
      plan: data.plan,
      pagination: data.pagination || {
        total: data.files.length,
        offset: 0,
        limit: data.files.length,
        hasMore: false,
      },
    };
  }

  /**
   * Folder-scoped, offset-paginated listing for the dashboard
   * (hits /api/cloud/files/list, the catalog-backed endpoint).
   *
   * @param path  "" for the drive root, "maskG/" for a sub-folder
   * @param opts  offset / limit / sort / order
   */
  async listFolder(path: string = "", opts: ListFolderOptions = {}): Promise<ListFolderResponse> {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.sort) params.set("sort", opts.sort);
    if (opts.order) params.set("order", opts.order);
    if (opts.retryFailedThumbnails) params.set("retryFailed", "1");
    if (opts.starred) params.set("starred", "1");
    if (opts.recent) params.set("recent", "1");

    const url = `/api/cloud/files/list${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Unable to load your files. Please try again.");
    }
    const data = await response.json();
    const files = ((data.files || []) as Array<{ key: string; size: number; lastModified: string; etag: string; hasThumbnail?: boolean; mimeType?: string | null; isStarred?: boolean; fileName?: string }>).map((f) => ({
      ...f,
      lastModified: new Date(f.lastModified),
    }));
    return {
      path: data.path,
      folders: ((data.folders || []) as Array<{ name: string; path: string; createdAt: string }>).map((f) => ({
        ...f,
        createdAt: new Date(f.createdAt),
      })),
      files,
      pagination: data.pagination ?? {
        offset: 0,
        limit: files.length,
        totalItems: files.length,
        hasMore: false,
      },
      sort: data.sort,
      order: data.order,
      usage: data.usage,
      limit: data.limit,
      plan: data.plan,
    };
  }

  /**
   * Validate if an upload would be allowed before actually uploading.
   * This saves bandwidth by checking limits before transferring the file.
   */
  async validateUpload(filename: string, size: number): Promise<ValidationResult> {
    try {
      const response = await fetch("/api/cloud/validate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, size }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          allowed: false,
          error: {
            code: data.code || "STORAGE_LIMIT",
            message: data.error || "Upload validation failed",
            details: data.details,
          },
          limits: data.limits,
        };
      }

      return {
        allowed: true,
        isOverwrite: data.isOverwrite,
        limits: data.limits,
      };
    } catch {
      // If validation fails, let the upload proceed and handle errors there
      return { allowed: true };
    }
  }

  /**
   * Parse error response from upload endpoint
   */
  private parseUploadError(status: number, responseText: string): UploadLimitError | null {
    try {
      const errorData = JSON.parse(responseText);
      if (status === 402 && errorData.code) {
        return {
          code: errorData.code,
          message: errorData.error,
          details: errorData.details,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  async uploadFile(file: File, onProgress?: (progress: number) => void): Promise<void> {
    // Use chunked upload for large files to avoid server memory issues
    if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
      return this.uploadFileChunked(file, onProgress);
    }

    // Server-proxied upload for small files - all traffic goes through our server
    const formData = new FormData();
    formData.append("file", file);
    formData.append("filename", file.name);

    const abortController = new AbortController();
    activeUploads.set(file.name, abortController);

    try {
      // Use XMLHttpRequest for progress tracking with server upload
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open("POST", "/api/cloud/upload");

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = (event.loaded / event.total) * 100;
              onProgress(percentComplete);
            }
          };
        }

        xhr.onload = () => {
          activeUploads.delete(file.name);

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            // Try to parse detailed error response
            const limitError = this.parseUploadError(xhr.status, xhr.responseText);

            if (limitError) {
              // Use the detailed error message from the server
              reject(new Error(limitError.message));
              return;
            }

            // Fallback error handling
            let errorMessage = "Upload failed. Please try again.";
            try {
              const errorData = JSON.parse(xhr.responseText);
              if (xhr.status === 402) {
                errorMessage = "Storage limit reached. Please upgrade your plan or delete some files.";
              } else if (xhr.status === 401) {
                errorMessage = "Session expired. Please refresh the page and try again.";
              } else if (errorData.error) {
                errorMessage = errorData.error;
              }
            } catch {
              // Use default error message
            }
            reject(new Error(errorMessage));
          }
        };

        xhr.onerror = () => {
          activeUploads.delete(file.name);
          reject(new Error("Network error during upload. Please check your connection."));
        };

        xhr.onabort = () => {
          activeUploads.delete(file.name);
          reject(new Error("Upload cancelled"));
        };

        // Listen for abort signal
        abortController.signal.addEventListener("abort", () => {
          xhr.abort();
        });

        xhr.send(formData);
      });
    } catch (error) {
      activeUploads.delete(file.name);
      throw error;
    }
  }

  /**
   * Upload a large file using chunked upload
   * This avoids server-side memory buffering by sending file in chunks
   */
  private async uploadFileChunked(file: File, onProgress?: (progress: number) => void): Promise<void> {
    // Initialize chunked upload
    const initResponse = await fetch("/api/cloud/upload/chunked/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      if (initResponse.status === 402) {
        throw new Error(errorData.error || "Storage limit reached");
      }
      throw new Error(errorData.error || "Failed to initialize upload");
    }

    const { uploadId, key, encrypt, isOverwrite } = await initResponse.json();

    // Track this chunked upload for cancellation
    const uploadState: ChunkedUploadState = {
      uploadId,
      key,
      encrypt,
      aborted: false,
      size: file.size,
      isOverwrite: isOverwrite || false,
    };
    activeChunkedUploads.set(file.name, uploadState);

    try {
      // Calculate chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const parts: { partNumber: number; etag: string }[] = [];
      let uploadedBytes = 0;

      // Upload chunks with limited concurrency
      const uploadChunk = async (chunkIndex: number): Promise<{ partNumber: number; etag: string }> => {
        if (uploadState.aborted) {
          throw new Error("Upload cancelled");
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const partNumber = chunkIndex + 1; // S3 part numbers are 1-based
        const isFinalPart = chunkIndex === totalChunks - 1;

        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("key", key);
        formData.append("partNumber", partNumber.toString());
        formData.append("chunk", chunk);
        formData.append("encrypt", encrypt.toString());
        formData.append("isFinalPart", isFinalPart.toString());

        const response = await fetch("/api/cloud/upload/chunked/part", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to upload part ${partNumber}`);
        }

        const { etag } = await response.json();

        // Update progress
        uploadedBytes += (end - start);
        if (onProgress) {
          onProgress((uploadedBytes / file.size) * 100);
        }

        return { partNumber, etag };
      };

      // Upload chunks with concurrency control
      for (let i = 0; i < totalChunks; i += MAX_CONCURRENT_CHUNKS) {
        if (uploadState.aborted) {
          throw new Error("Upload cancelled");
        }

        const chunkPromises: Promise<{ partNumber: number; etag: string }>[] = [];
        for (let j = 0; j < MAX_CONCURRENT_CHUNKS && (i + j) < totalChunks; j++) {
          chunkPromises.push(uploadChunk(i + j));
        }

        const results = await Promise.all(chunkPromises);
        parts.push(...results);
      }

      // Complete the upload
      const completeResponse = await fetch("/api/cloud/upload/chunked/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          key,
          parts,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          encrypted: encrypt,
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to complete upload");
      }

      activeChunkedUploads.delete(file.name);
    } catch (error) {
      // Abort the upload on failure
      activeChunkedUploads.delete(file.name);

      if (!uploadState.aborted) {
        // Try to abort the multipart upload and rollback quota
        try {
          await fetch("/api/cloud/upload/chunked/complete", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uploadId,
              key,
              size: file.size,
              isOverwrite: uploadState.isOverwrite,
            }),
          });
        } catch {
          // Ignore abort errors
        }
      }

      throw error;
    }
  }

  /**
   * Upload file with pre-validation.
   * Validates limits before uploading to save bandwidth on large files.
   */
  async uploadFileWithValidation(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: UploadLimitError }> {
    // Pre-validate the upload
    const validation = await this.validateUpload(file.name, file.size);

    if (!validation.allowed && validation.error) {
      return { success: false, error: validation.error };
    }

    try {
      await this.uploadFile(file, onProgress);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      return {
        success: false,
        error: {
          code: "STORAGE_LIMIT",
          message,
        },
      };
    }
  }

  cancelUpload(fileName: string): boolean {
    // Check regular uploads
    const controller = activeUploads.get(fileName);
    if (controller) {
      controller.abort();
      activeUploads.delete(fileName);
      return true;
    }

    // Check chunked uploads
    const chunkedState = activeChunkedUploads.get(fileName);
    if (chunkedState) {
      chunkedState.aborted = true;
      // Try to abort the multipart upload and rollback quota
      fetch("/api/cloud/upload/chunked/complete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: chunkedState.uploadId,
          key: chunkedState.key,
          size: chunkedState.size,
          isOverwrite: chunkedState.isOverwrite,
        }),
      }).catch(() => {
        // Ignore abort errors
      });
      activeChunkedUploads.delete(fileName);
      return true;
    }

    return false;
  }

  cancelAllUploads(): void {
    // Cancel regular uploads
    activeUploads.forEach((controller) => {
      controller.abort();
    });
    activeUploads.clear();

    // Cancel chunked uploads
    activeChunkedUploads.forEach((state) => {
      state.aborted = true;
      fetch("/api/cloud/upload/chunked/complete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: state.uploadId,
          key: state.key,
          size: state.size,
          isOverwrite: state.isOverwrite,
        }),
      }).catch(() => {
        // Ignore abort errors
      });
    });
    activeChunkedUploads.clear();
  }

  /**
   * Create a folder in cloud storage.
   * Folders are 0-byte objects with a trailing slash - not encrypted.
   */
  async createFolder(folderPath: string): Promise<void> {
    const response = await fetch("/api/cloud/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
    });

    if (!response.ok) {
      throw new Error("Unable to create folder. Please try again.");
    }
  }

  async deleteFile(key: string): Promise<void> {
    const response = await fetch("/api/cloud/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      throw new Error("Unable to delete file. Please try again.");
    }
  }

  getDownloadUrl(key: string): string {
    if (key.endsWith("/")) {
      return `/api/cloud/folder/download?key=${encodeURIComponent(key)}`;
    }

    return `/api/cloud/download?key=${encodeURIComponent(key)}`;
  }

  getViewUrl(key: string): string {
    return `/api/cloud/view?key=${encodeURIComponent(key)}`;
  }

  async createShareLink(
    key: string,
    expiresInHours?: number,
    accessType?: string,
    allowDownload?: boolean,
    allowAddToDrive?: boolean,
    targetType: "file" | "folder" = "file"
  ): Promise<{ url: string }> {
    const response = await fetch("/api/cloud/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        targetType,
        accessType,
        allowDownload: allowDownload !== false,
        allowAddToDrive: allowAddToDrive !== false,
      }),
    });

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error("Link sharing is temporarily unavailable. Please try again later.");
      }
      throw new Error("Unable to create share link. Please try again.");
    }

    const data = await response.json();
    return { url: data.shareUrl };
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const response = await fetch("/api/cloud/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });

    if (!response.ok) {
      throw new Error("Unable to revoke share link. Please try again.");
    }
  }
}

export const cloudClient = new CloudClient();
